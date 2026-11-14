
import * as ohm from 'ohm-js';
import { init } from 'z3-solver';
//const { Context } = await init();
//const ctx = new Context("main");
//const { Solver, Int} = ctx;

//----------------------------------------------------------------------

let z3Promise = null;


async function getZ3Context()
{
    if(!z3Promise)
    {
        z3Promise = init().then(z3 => {
            const ctx = new z3.Context("main");
            return {
                ctx, 
                Solver: ctx.Solver
            };
        });
    }
    return z3Promise;
}

const operation = (node, ctx, bindings = {}, typeRegistry = {}, predicateRegistry = {}, knownVarTypes = {}) => {
    
    switch(node.type){ 
        case "Number":
            return ctx.Real.val(node.value);

        case "Variable":

            if(node.name.includes("."))
            {
                const parts = node.name.split(".");
                const first = parts[0];
                const rest = parts.slice(1);
                const rootType = knownVarTypes[first];
                const offset = getFieldOffset(rootType, rest, typeRegistry);
                const types = getFieldType(rootType, rest, typeRegistry);

                if(offset < 0)
                {
                    throw new Error(`Unknown property "${node.name}".`);
                }

                // Simplify if-statement

                if( /*Array.isArray(bindings[first]) &&*/  bindings[first][offset] !== undefined)
                {
                    return bindings[first][offset];
                }

                if(types === "Real")
                {
                    return ctx.Real.const(node.name);
                }

                return ctx.Int.const(node.name);
            }

            if(bindings[node.name] !== undefined)
            {
                return bindings[node.name];
            }

            return ctx.Real.const(node.name);
            
        /*
            if (bindings[node.name] !== undefined) {
                return bindings[node.name];
            }
            return ctx.Real.const(node.name);
        */

        case "Fact":
            if(predicateRegistry[node.name])
            {
                const nodePredicate = predicateRegistry[node.name];
                const localBindings = {...bindings};
                const localTypes = {...knownVarTypes};

                nodePredicate.args.forEach((arg, idx) => {
                    const argNode = node.args[idx];
                    const parameterName = typeof arg === "string" ? arg : arg.name;
                    const parameterType = typeof arg === "string" ? "Real" : arg.typeName;
                    localBindings[parameterName] = bindArgument(
                        argNode,
                        parameterType,
                        ctx,
                        bindings,
                        typeRegistry,
                        predicateRegistry,
                        knownVarTypes
                    );
                    localTypes[parameterName] = parameterType;
                });

                return operation(nodePredicate.bodyAST, ctx, localBindings, typeRegistry, predicateRegistry, localTypes);
            }

        case "Add":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).add(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Subtract":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).sub(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Multiply":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).mul(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Divide":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).div(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Lessthan":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).lt(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Biggerthan":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).gt(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));
        
        case "Equal":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).eq(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "NotEqual":
            return ctx.Not(operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).eq(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes)));

        case "LessthanEqual":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).le(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "BiggerthanEqual":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes).ge(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));

        case "Exists":
            
            const quantified = [];
            const extendedBindings = {...bindings};
            const extendedTypes = {...knownVarTypes};

            node.variables.forEach(variable => {
                const symbolicValue = makeSymbolicValue(
                    variable.typeName,
                    variable.name,
                    ctx,
                    typeRegistry
                );
                extendedBindings[variable.name] = symbolicValue;
                extendedTypes[variable.name] = variable.typeName;
                quantified.push(...flattenTerms(symbolicValue));
            });

            const body = operation(
                node.bodyAST,
                ctx,
                extendedBindings,
                typeRegistry,
                predicateRegistry,
                extendedTypes
            );

            return ctx.Exists(quantified, body);

        case "Forall":
        {
            const quantified = [];
            const extendedBindings = {...bindings};
            const extendedTypes = {...knownVarTypes};

            node.variables.forEach(variable => {
                const symbolicValue = makeSymbolicValue(
                    variable.typeName,
                    variable.name,
                    ctx,
                    typeRegistry
                );
                extendedBindings[variable.name] = symbolicValue;
                extendedTypes[variable.name] = variable.typeName;
                quantified.push(...flattenTerms(symbolicValue));
            });

            const body = operation(
                node.bodyAST,
                ctx,
                extendedBindings,
                typeRegistry,
                predicateRegistry,
                extendedTypes
            );
            return ctx.Forall(quantified, body);
        }

        case "Power":
            const left = operation(node.left, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes);
            const right = operation(node.right, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes); 
            return left.pow(right); 
            
        case "And": 
            const expr = node.expressions.map(e => operation(e, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes));
            return expr.length > 0 ? ctx.And(...expr) : ctx.Bool.val(true);

        default: 
            console.log("Unknown type");
    }
}

// Function for counting primitives (Real and Int) that make up a given type
function getPrimitiveCount(typeName, typeRegistry)
{
    const fields = typeRegistry[typeName];
    if(!fields)
    {
        return 1;
    }

    return fields.reduce((sum, field) => {
        return sum + getPrimitiveCount(field.type, typeRegistry);
    }, 0);
}

// Function for finding the starting index of a nested field within a flattened array 
// so properties can be looked up in bindings
function getFieldOffset(typeName, path, typeRegistry)
{
    const fields = typeRegistry[typeName];
    if(!fields)
    {
        return -1;
    }
    
    let currentOffset = 0;

    for(const field of fields)
    {
        if(field.name === path[0])
        {
            if(path.length === 1)
            {
                return currentOffset; 
            } 

            return currentOffset + getFieldOffset(field.type, path.slice(1), typeRegistry);
        }

        currentOffset += getPrimitiveCount(field.type, typeRegistry);
    }

    return -1;
}

// Function for looking up and returning the declared type of a nested field along a property path
function getFieldType(typeName, path, typeRegistry)
{
    const fields = typeRegistry[typeName];

    if(!fields)
    {
        return typeName;
    }

    const field = fields.find(f => f.name === path[0]);

    if(!field)
    {
        return null;
    }

    if(path.length === 1)
    {
        return field.type;
    }

    return getFieldType(field.type, path.slice(1), typeRegistry);

}

// Function for parsing a compound expression into a flattened array of Z3 terms
function getRecordArgument(value, field, index, typeRegistry)
{
    const args = Array.isArray(value)
        ? value
        : value?.type === "Compound"
            ? value.args
            : null;

    if(!args)
    {
        return value && typeof value === "object" && Object.hasOwn(value, field.name)
            ? value[field.name]
            : undefined;
    }

    const namedField = args.find(arg => arg?.type === "Compound" && arg.name === field.name);
    const fieldValue = namedField ?? args[index];

    if(namedField && getRecordFields(field.type, typeRegistry))
    {
        return namedField.args;
    }

    if(namedField && namedField.args.length === 1)
    {
        return namedField.args[0];
    }

    return fieldValue;
}

// Function for returning an array of field strings inside a compound expression
function getRecordFields(typeName, typeRegistry)
{
    const fields = typeRegistry[typeName];
    return Array.isArray(fields) && fields.every(field => field && typeof field === "object")
        ? fields
        : null;
}

// Function for returning type of an argument at a given index
function getArgumentType(factName, index, typeRegistry)
{
    const recordFields = getRecordFields(factName, typeRegistry);
    if(recordFields)
    {
        return recordFields[index]?.type;
    }

    return typeRegistry[factName]?.[index];
}

// Function for returning a flattened array of primitive types
function getPrimitiveTypes(typeName, typeRegistry)
{
    const fields = getRecordFields(typeName, typeRegistry);
    return fields
        ? fields.flatMap(field => getPrimitiveTypes(field.type, typeRegistry))
        : [typeName];
}

// Function for returning a flattened array of numeric values from a compound record value
function flattenConcreteValue(typeName, value, typeRegistry)
{
    const fields = getRecordFields(typeName, typeRegistry);
    if(fields)
    {
        return fields.flatMap((field, index) => {
            const fieldValue = getRecordArgument(value, field, index, typeRegistry);
            if(fieldValue === undefined)
            {
                throw new Error(`Missing field "${field.name}" in value of type "${typeName}".`);
            }
            return flattenConcreteValue(field.type, fieldValue, typeRegistry);
        });
    }

    if(value?.type === "Compound" && value.args.length === 1)
    {
        return flattenConcreteValue(typeName, value.args[0], typeRegistry);
    }

    if(typeof value !== "number")
    {
        throw new Error(`Expected a numeric value for type "${typeName}".`);
    }

    return [value];
}

// Function for flattening a record of fields into an array consisting of Z3 symbolic values.
//  If there are no fields, return the Z3 value of either Int or Real. 
function makeSymbolicValue(typeName, name, ctx, typeRegistry)
{
    const fields = getRecordFields(typeName, typeRegistry);
    if(fields)
    {
        return fields.flatMap(field => makeSymbolicValue(
            field.type,
            `${name}.${field.name}`,
            ctx,
            typeRegistry
        ));
    }

    return String(typeName).toLowerCase() === "int"
        ? ctx.Int.const(name)
        : ctx.Real.const(name);
}

// Function for checking if a term is already an array. If it is, return as it is, otherwise wrap the Z3 term in an array. 
function flattenTerms(value)
{
    return Array.isArray(value) ? value : [value];
}

// Function for splitting a compound variable into its Z3 bound terms, a sliced sub-record or a single Z3 term evaluated
// by calling operation function
function getVariableArgument(node, expectedType, ctx, bindings, typeRegistry, knownVarTypes)
{
    const [rootName, ...path] = node.name.split(".");
    const value = bindings[rootName];
    const rootType = knownVarTypes[rootName] ?? expectedType;

    if(path.length === 0)
    {
        return value ?? makeSymbolicValue(expectedType, rootName, ctx, typeRegistry);
    }

    const fieldType = getFieldType(rootType, path, typeRegistry);
    const offset = getFieldOffset(rootType, path, typeRegistry);
    if(offset < 0 || !fieldType)
    {
        throw new Error(`Unknown property "${node.name}".`);
    }

    const fieldCount = getPrimitiveCount(fieldType, typeRegistry);
    if(Array.isArray(value) && getRecordFields(expectedType, typeRegistry))
    {
        return value.slice(offset, offset + fieldCount);
    }

    if(getRecordFields(fieldType, typeRegistry))
    {
        return value.slice(offset, offset + fieldCount);
    }

    return operation(node, ctx, bindings, typeRegistry, {}, knownVarTypes);
}

// Function for checking the type of node and bind the argument as a Z3 value of ExpectedType. 
function bindArgument(node, expectedType, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes)
{
    if(Array.isArray(node))
    {
        const fields = getRecordFields(expectedType, typeRegistry);
        if(!fields || fields.length !== node.length)
        {
            throw new Error(`Expected a record value of type "${expectedType}".`);
        }

        return fields.flatMap((field, index) => bindArgument(
            node[index],
            field.type,
            ctx,
            bindings,
            typeRegistry,
            predicateRegistry,
            knownVarTypes
        ));
    }

    if(node.type === "Variable")
    {
        return getVariableArgument(node, expectedType, ctx, bindings, typeRegistry, knownVarTypes);
    }

    if(node.type === "Number")
    {
        return String(expectedType).toLowerCase() === "int"
            ? ctx.Int.val(node.value)
            : ctx.Real.val(node.value);
    }

    if(node.type === "Compound")
    {
        const fields = getRecordFields(expectedType, typeRegistry);
        if(fields)
        {
            return fields.flatMap((field, index) => {
                const fieldValue = getRecordArgument(node, field, index, typeRegistry);
                if(fieldValue === undefined)
                {
                    throw new Error(`Missing field "${field.name}" in argument of type "${expectedType}".`);
                }
                return bindArgument(
                    fieldValue,
                    field.type,
                    ctx,
                    bindings,
                    typeRegistry,
                    predicateRegistry,
                    knownVarTypes
                );
            });
        }

        if(node.args.length === 1)
        {
            return bindArgument(
                node.args[0],
                expectedType,
                ctx,
                bindings,
                typeRegistry,
                predicateRegistry,
                knownVarTypes
            );
        }
    }

    throw new Error(`Cannot use this argument as a value of type "${expectedType}".`);
}

// Function for finding matches when rule firing, consisting of the following helper functions: 
/*
    valuesEqual - Checks if two values or compound terms are equal 
    matchArgument - Matching a pattern value against a concrete value
    matchStage - Applies matchArgument for comparing pattern argument with fact argument
*/
function findMatches(keep, remove, facts)
{
    const patterns = [...keep, ...remove];
    const result = [];

    function valuesEqual(left, right)
    {
        if(left === right)
        {
            return true;
        }

        return left?.type === "Compound" 
        && right?.type === "Compound" 
        && left.name === right.name 
        && left.args.length === right.args.length
        && left.args.every((arg, index) => valuesEqual(arg, right.args[index]));
    }

    function matchArgument(pattern, value, bindings)
    {
        if(pattern.type === "Variable")
        {
            if(pattern.name in bindings)
            {
                return valuesEqual(bindings[pattern.name], value);
            }

            bindings[pattern.name] = value;
            return true;
        }

        if(pattern.type === "Number")
        {
            return typeof value === "number" && pattern.value === value;
        }

        if(pattern.type === "Compound")
        {
            return value?.type === "Compound" 
            && pattern.name === value.name
            && pattern.args.length === value.args.length
            && pattern.args.every((arg, index) => matchArgument(arg, value.args[index], bindings));
        }

        return false;
    }

    function matchStage(patternIdx, currentMatchIds, boundVars)
    {
        // A base case (patternIdx === patterns.length) checking if we have reached the end of array and every pattern
       // have been matched. If not, it should continue to match. Push the keepids, removeids, the matchids and boundvars to array
        if(patternIdx === patterns.length)
        {
            result.push({
                keepIds: currentMatchIds.slice(0, keep.length),
                removeIds: currentMatchIds.slice(keep.length),
                matchIds: currentMatchIds.slice(),
                boundVars: {...boundVars}
            });
            return;
        }

        // Retrieve the current pattern that we want to match against a fact
        const pattern = patterns[patternIdx];
        const isTypedFact = pattern.type === "TypedFact";
        const patternArgsLen = isTypedFact ? 0 : pattern.args.length;
        
        for(let i = 0; i < facts.length; i++)
        { 
            const fact = facts[i];

            // Check that the current match contains the id of our fact. If it does skip
            if(currentMatchIds.includes(fact.id))
            {
                continue;
            }

            // If the name or the number of arguments doesn't match the current pattern, skip
            if(fact.name !== (isTypedFact ? pattern.typeName : pattern.name)
                || (!isTypedFact && fact.args.length !== pattern.args.length))
            {
                continue;
            }

            const nextboundVars = {...boundVars};
            let mismatch = false;

            if(isTypedFact)
            {
                const value = {
                    type: "Compound",
                    name: pattern.typeName,
                    args: fact.args
                };
                const variableName = pattern.variableName;
                if(variableName in nextboundVars)
                {
                    mismatch = !valuesEqual(nextboundVars[variableName], value);
                }
                else
                {
                    nextboundVars[variableName] = value;
                }
            }
        
            for(let j = 0; j < patternArgsLen; j++)
            {
                const pArg = pattern.args[j];
                const fArg = fact.args[j];

                if(!matchArgument(pArg, fArg, nextboundVars))
                {
                    mismatch = true;
                    break;
                }

                /*
                // In these sections, we want to compare pattern argument with fact argument
                if(pArg.type === "Number")
                {
                    if(pArg.value !== fArg)
                    {
                        mismatch = true;
                        break;
                    }
                }

                else if(pArg.type === "Variable")
                {
                    if(pArg.name in nextboundVars)
                    {
                        if(nextboundVars[pArg.name] !== fArg)
                        {
                            mismatch = true;
                            break;
                        }
                    }

                    else
                    {
                        nextboundVars[pArg.name] = fArg;
                    }
                }
                */
            }

            // Backtracking:
            // If the current fact matches, add its ID and recursively try matching the next pattern
            // Remove the ID afterwards so that other possible matching combinations can be explored
            if(!mismatch)
            {
                currentMatchIds.push(fact.id);
                matchStage(patternIdx + 1, currentMatchIds, nextboundVars);
                currentMatchIds.pop();
            }
        }
    }

    matchStage(0, [], {});
    return result;
}

function collectVariables(node, vars = new Set())
{
    if(!node)
    {
        return vars;
    }

    if(node.type === "Variable")
    {
        vars.add(node.name.split(".")[0]);
    }

    if(node.args)
    {
        node.args.forEach(arg => collectVariables(arg, vars));
    }

    if(node.expressions)
    {
        node.expressions.forEach(expression => collectVariables(expression, vars));
    }

    if(node.left)
    {
        collectVariables(node.left, vars);
    }

    if(node.right)
    {
        collectVariables(node.right, vars);
    }

    if(node.bodyAST)
    {
        collectVariables(node.bodyAST, vars);
    }

    return vars;
}

// Function for generating unique keys from a rule index and matched fact ID's, so that a rule is not fired twice. 
function activationKey(ruleIdx, candidate)
{
    return `${ruleIdx}:${candidate.matchIds.join(",")}`;
}

// Function for ensuring every fact has a unique Id. If an Id is missing or already in use, generate a new one
function normalizeFactIds(facts)
{
    const usedIds = new Set();
    let nextId = 1;

    return facts.map(fact => {
        let id = fact.id;
        if(id === undefined || usedIds.has(id))
        {
            while(usedIds.has(nextId))
            {
                nextId++;
            }
            id = nextId;
        }

        usedIds.add(id);
        if(typeof id === "number" && id >= nextId)
        {
            nextId = id + 1;
        }

        return {...fact, id};
    });
}

// Function for finding the highest Id and create the next available fact Id. 
function getNextFactId(facts)
{
    return facts.reduce((maxId, fact) => {
        return typeof fact.id === "number" && fact.id > maxId ? fact.id : maxId;
    }, 0) + 1;
}

// Function for matching the pattern fields through index and recording each variable's expected type in knownVarTypes
// before firing a rule
function inferVariableTypes(pattern, typeName, knownVarTypes, typeRegistry)
{
    if(Array.isArray(pattern))
    {
        const fields = getRecordFields(typeName, typeRegistry);
        if(!fields || fields.length !== pattern.length)
        {
            throw new Error(`Pattern value does not match type "${typeName}".`);
        }

        fields.forEach((field, index) => {
            inferVariableTypes(pattern[index], field.type, knownVarTypes, typeRegistry);
        });
        return;
    }

    if(pattern.type === "Variable")
    {
        knownVarTypes[pattern.name] = typeName ?? "Real";
        return;
    }

    const fields = getRecordFields(typeName, typeRegistry);

    if(fields && pattern.type === "Compound")
    {
        fields.forEach((field, index) => {
            const fieldValue = getRecordArgument(pattern, field, index, typeRegistry);
            if(fieldValue !== undefined)
            {
                inferVariableTypes(fieldValue, field.type, knownVarTypes, typeRegistry);
            }
        });
        return;
    }

    if(pattern.type === "Compound" && pattern.args.length === 1)
    {
        inferVariableTypes(pattern.args[0], typeName, knownVarTypes, typeRegistry);
    }
}

// Function for evaluating a fire rule against the current facts by: 
/*
    - Finds matches (calling findMatches function)

    - Checks guard conditions

    - Checks if the current rule has already fired (via activationkey)

    - applying the rule's body (adding/removing facts or by adding Z3 constraints)

    - Returns whether that rule fired
*/
async function FireRule(node, ctx, Solver, facts, typeRegistry, predicateRegistry, firedActivations, ruleIdx, nextFactId)
{
    const candidates = findMatches(node.keep, node.remove, facts);

    for(const candidate of candidates)
    {

        const key = activationKey(ruleIdx, candidate);
        if(firedActivations.has(key))
        {
            continue;
        }

        const bindings = {};
        const solver = new Solver();

        const patterns = [...node.keep, ...node.remove];
        const knownVarTypes = {};

        patterns.forEach(pattern => {
            if(pattern.type === "TypedFact")
            {
                knownVarTypes[pattern.variableName] = pattern.typeName;
                return;
            }

            pattern.args.forEach((arg, idx) => {
                inferVariableTypes(
                    arg,
                    getArgumentType(pattern.name, idx, typeRegistry) ?? "Real",
                    knownVarTypes,
                    typeRegistry
                );
            });
        });


        const guardVars = collectVariables(node.guard);

        for(const varName of guardVars)
        {
            bindings[varName] = makeSymbolicValue(
                knownVarTypes[varName] ?? "Real",
                varName,
                ctx,
                typeRegistry
            );
        }

        for(const varName of Object.keys(candidate.boundVars))
        {
            if(bindings[varName] === undefined)
            {
                bindings[varName] = makeSymbolicValue(
                    knownVarTypes[varName] ?? "Real",
                    varName,
                    ctx,
                    typeRegistry
                );
            }
        }

        // Adds a solver constraint for each variable matched from the facts
        for(const [varName, value] of Object.entries(candidate.boundVars))
        {
            const valueTypes = getPrimitiveTypes(knownVarTypes[varName] ?? "Real", typeRegistry);
            const symbolicTerms = flattenTerms(bindings[varName]);
            const concreteValues = flattenConcreteValue(
                knownVarTypes[varName] ?? "Real",
                value,
                typeRegistry
            );
            if(symbolicTerms.length !== concreteValues.length || symbolicTerms.length !== valueTypes.length)
            {
                throw new Error(`Value for "${varName}" does not match its declared type.`);
            }

            symbolicTerms.forEach((term, index) => {
                const isInt = String(valueTypes[index]).toLowerCase() === "int";
                solver.add(term.eq(isInt
                    ? ctx.Int.val(Number(concreteValues[index]))
                    : ctx.Real.val(Number(concreteValues[index]))
                ));
            });
        }

        const constraint = operation(node.guard, ctx, bindings, typeRegistry, predicateRegistry, knownVarTypes);
        solver.add(constraint);

        const resultSolver = await solver.check();

        if(resultSolver === "sat")
        {
            const model = solver.model();
            const factsToRemove = new Set(candidate.removeIds);
            const updatedFacts = facts.filter(fact => !factsToRemove.has(fact.id));

            function buildAddedArgument(arg, expectedType)
            {
                if (arg.type === "Number")
                {
                    return arg.value;
                }

                if(arg.type === "Variable")
                {
                    if(Object.hasOwn(candidate.boundVars, arg.name))
                    {
                        return candidate.boundVars[arg.name];
                    }

                    const isInt = String(expectedType).toLowerCase() === "int";
                    const term = isInt ? ctx.Int.const(arg.name) : ctx.Real.const(arg.name);
                    return parseFloat(model.eval(term).toString());

                }

                if(arg.type === "Compound")
                {
                    return {
                        type: "Compound", 
                        name: arg.name, 
                        args: arg.args.map(child => buildAddedArgument(child, expectedType))
                    };
                }

                throw new Error(`Unsupported added argument type "${arg.type}".`);
            };

            // Creates each fact on the rule's right-hand side
            for(const addedPattern of node.added)
            {
                const newArgs = addedPattern.args.map((arg, idx) =>
                    
                    buildAddedArgument(arg, getArgumentType(addedPattern.name, idx, typeRegistry))
                );

                updatedFacts.push({
                    id: nextFactId.value++,
                    name: addedPattern.name,
                    args: newArgs
                });
            }

            firedActivations.add(key);
            return {
                fired: true, 
                facts: updatedFacts
            };
        }
    }

    return {
        fired: false,
        facts
    }
}

export function parseFactStoreText(text)
{
    if(!text.trim())
    {
        return [];
    }

    const facts = String.raw`
        Facts
        {
            Store = FactList
            FactList = Fact ("," Fact)*
            Fact = ident "(" Arglist ")"
            Arglist = Argument ("," Argument)*
            Argument = Number -- number
                      | Compound -- compound
            Compound = ident "(" Arglist ")"
            Number = float | signedInt | int
            int = digit+
            signedInt = "-" digit+
            float = ("-"? digit+ "." digit+)
            ident = letter alnum*
        }
    `

    const grammar = ohm.grammar(facts);

    const semantics = grammar.createSemantics().addOperation("ast", {
        Store(e)
        {
            return e.ast();
        },

        FactList(first, _comma, rest)
        {
            return [first.ast(), ...rest.children.map(c => c.ast())];
        }, 

        Fact(name, _open, args, _closed)
        {
            return {
                name: name.sourceString,
                args: args.ast()
            };
        }, 

        Arglist(first, _comma, rest)
        {
            return [first.ast(), ...rest.children.map(c => c.ast())];
        },

        Argument(e)
        {
            return e.ast();
        },

        Argument_number(value)
        {
            return value.ast();
        },

        Argument_compound(value)
        {
            return value.ast();
        },

        Number(value)
        {
            return parseFloat(value.sourceString);
        },

        Compound(name, _open, args, _closed)
        {
            return {
                type: "Compound", 
                name: name.sourceString, 
                args: args.ast()
            };
        },

        ident(first, rest)
        {
            return first.sourceString + rest.sourceString;
        }
    });

    const match = grammar.match(text.trim());
    const rawFacts = semantics(match).ast();
    //return semantics(match).ast();

    let counterId = 1;
    return rawFacts.map(fact => ({
        id: counterId++,
        name: fact.name,
        args: fact.args
    }));
}

// Iteratively fires all rules against the current facts until the no more rules can be fired
// Uses fireRule function as a helper. 
async function executeRules(ctx, Solver, ast, result, typeRegistry, predicateRegistry, firedActivations, nextFactId)
{
    const passes = 1000;
    let passCount = 0; 
     while(true)
        {
            if(passCount >= passes)
            {
                throw new Error("Execution limit reached");
            } 

            passCount++;

            let firedInPass = false;

            for(let ruleIdx = 0; ruleIdx < ast.length; ruleIdx++)
            {
                const ruleResult = await FireRule(
                    ast[ruleIdx],
                    ctx,
                    Solver,
                    result.facts,
                    typeRegistry,
                    predicateRegistry,
                    firedActivations,
                    ruleIdx,
                    nextFactId
                );

                if(ruleResult.fired)
                {
                    result = {
                        fired: true,
                        facts: ruleResult.facts
                    };
                    firedInPass = true;
                    break;
                }
            }

            if(!firedInPass)
            {
                break;
            }
        }

        return result;

}

function serializeArgument(arg)
{
    if(arg.type === "Compound")
    {
        return `${arg.name}(${arg.args.map(serializeArgument).join(", ")})`;
    }

    return String(arg);
}

export function serializeFacts(factsArr)
{
    return factsArr.map(f => `${f.name}(${f.args.map(serializeArgument).join(", ")})`).join(", ");
}

export async function solve(userInput, facts, typesInput = "", predicatesInput = "")
{
    const { ctx, Solver } = await getZ3Context();

    const myArithmetic = String.raw`
    MyArithmetic
    {
        Program = Rule+
        Rule = TypedKeep "/" "=>" Guard "|" Added "."? -- typed
             | Keep "/" Remove "=>" Guard "|" Added "."? -- regular

        Keep = Factlist?
        Remove = Factlist?
        Added = Factlist?

        TypedKeep = TypedBinding ("," TypedBinding)*
        TypedBinding = Variable ":" Variable

        Factlist = Fact ("," Fact)*
        Fact = Variable "(" Arglist ")" 
        Arglist = Argument ("," Argument)*
        
        Argument = Compound | Variable | Number 

        Guard = Explist?

        Explist = Exp ("," Exp)*

        Exp = QuanExp

        QuanExp = "E" Variable ":" Variable Exp -- exists
                | "exists" Variable ":" Variable Exp -- existsWord
                | "All" Variable ":" Variable Exp -- forall
                | "Forall" Variable ":" Variable Exp -- forallCaps
                | "forall" Variable ":" Variable Exp -- forallWord
                | AndExp

        AndExp = AndExp "and" RelExp -- and
                | RelExp

        RelExp = AddExp "<" AddExp -- lessthan
               | AddExp ">" AddExp -- biggerthan
               | AddExp "===" AddExp -- equal
               | AddExp "!==" AddExp -- notequal
               | AddExp "<=" AddExp -- lessthanequal
               | AddExp ">=" AddExp -- biggerthanequal
               | AddExp

        AddExp = AddExp "+" PowExp -- add
                | AddExp "-" PowExp -- subtract
                | AddExp "*" PowExp -- multiply
                | AddExp "/" PowExp -- divide
                | PowExp

        PowExp = PowExp "^" PriExp -- power
                | PriExp

        PriExp = "(" Exp ")" -- paren
                | Fact
                | Number
                | Variable
        
        Compound = Variable "(" Arglist ")"
        Number = "-"? digit+ ("." digit+)?
        Variable = letter alnum* DottedPart*
        DottedPart = "." letter alnum*
    }`

    const grammar = ohm.grammar(myArithmetic);

    const semantics = grammar.createSemantics().addOperation("ast", {
        Program(rules)
        {
            return rules.children.map(r => r.ast());
        },
        _iter(...children) {
            return children.map(c => c.ast());
        },
        Keep(e)
        {
            //return e.children.length > 0 ? e.ast().flat() : [];
            return e.sourceString.trim() !== "" ? e.ast().flat() : [];
        },

        Remove(e)
        {
            //return e.children.length > 0 ? e.ast().flat() : [];
            return e.sourceString.trim() !== "" ? e.ast().flat() : [];
        },

        Added(e)
        {
            //return e.children.length > 0 ? e.ast().flat() : [];
            return e.sourceString.trim() !== "" ? e.ast().flat() : [];
        },

        Factlist(first, _comma, rest)
        {
            return [
                first.ast(), 
                ...rest.children.map(fact => fact.ast())
            ].flat();
        },

        Fact(name, _start, args, _end)
        {
            return {
                type: "Fact", 
                name: name.sourceString,
                args: args.ast()
            };
        },

        Arglist(first, _comma, rest)
        {
            return [
                first.ast(), 
                ...rest.children.map(arg => arg.ast())
            ];
        },

        Argument(e)
        {
            return e.ast();
        },

        Rule_typed(typedKeep, _slash, _leadsTo, guard, _pipe, added, _period)
        {
            return {
                type: "Rule",
                keep: typedKeep.ast(),
                remove: [],
                guard: guard.ast(),
                added: added.ast()
            };
        },

        Rule_regular(_keep, _slash, _remove, _leadsTo, _guard, _pipe, _added, _period){
            void _period;
            return {
                type: "Rule", 
                keep: _keep.ast(), 
                remove: _remove.ast(), 
                guard: _guard.ast(),
                added: _added.ast()
            };
        },

        TypedKeep(first, _comma, rest)
        {
            return [first.ast(), ...rest.children.map(binding => binding.ast())];
        },

        TypedBinding(variable, _colon, typeName)
        {
            return {
                type: "TypedFact",
                variableName: variable.sourceString,
                typeName: typeName.sourceString
            };
        },
        
        Guard(e)
        {
            return e.children.length > 0
                ? e.children[0].ast()
                : { type: "And", expressions: [] };
        },

        Explist(first, _comma, rest)
        {
            return {
                type: "And", 
                expressions: [
                    first.ast(), 
                    ...rest.children.map(c => c.ast())
                ]
            };
        },

        Exp(e)
        {
            return e.ast();
        },

        AndExp(e)
        {
            return e.ast();
        },

        AndExp_and(left, _and, right)
        {
            const leftExpr = left.ast();
            return {
                type: "And",
                expressions: leftExpr.type === "And"
                    ? [...leftExpr.expressions, right.ast()]
                    : [leftExpr, right.ast()]
            };
        },

        RelExp(e)
        {
            return e.ast();
        },

        RelExp_lessthan(a, _, b)
        {
            return {
                type: "Lessthan", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        RelExp_biggerthan(a, _, b)
        {
            return {
                type: "Biggerthan", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        RelExp_equal(a, _, b)
        {
            return {
                type: "Equal", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        RelExp_notequal(a, _, b)
        {
            return {
                type: "NotEqual", 
                left: a.ast(), 
                right: b.ast()
            };
        }, 

        RelExp_lessthanequal(a, _, b)
        {
            return {
                type: "LessthanEqual", 
                left: a.ast(),
                right: b.ast()
            };
        }, 

        RelExp_biggerthanequal(a, _, b)
        {
            return {
                type: "BiggerthanEqual", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        AddExp(e)
        {
            return e.ast();
        },

        AddExp_add(a, _, b)
        {
            return {
                type: "Add",
                left: a.ast(), 
                right: b.ast()
            };
        },

        AddExp_subtract(a, _, b)
        {
            return {
                type: "Subtract", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        AddExp_multiply(a, _, b)
        {
            return {
                type: "Multiply", 
                left: a.ast(), 
                right: b.ast()
            };
        }, 

        AddExp_divide(a, _, b)
        {
            return {
                type: "Divide", 
                left: a.ast(), 
                right: b.ast()
            };
        },

        QuanExp(e)
        {
            return e.ast();
        },

        QuanExp_exists(_op, variableNode, _colon, typeNode, bodyNode)
        {
            return {
                type: "Exists", 
                variables: [{
                    name: variableNode.sourceString, 
                    typeName: typeNode.sourceString
                }], 
                bodyAST: bodyNode.ast()
            };
        },

        QuanExp_existsWord(_op, variableNode, _colon, typeNode, bodyNode)
        {
            return {
                type: "Exists",
                variables: [{
                    name: variableNode.sourceString,
                    typeName: typeNode.sourceString
                }],
                bodyAST: bodyNode.ast()
            };
        },

        QuanExp_forall(_op, variableNode, _colon, typeNode, bodyNode)
        {
            return {
                type: "Forall", 
                variables: [{
                    name: variableNode.sourceString, 
                    typeName: typeNode.sourceString
                }],
                bodyAST: bodyNode.ast()
            };
        },

        QuanExp_forallCaps(_op, variableNode, _colon, typeNode, bodyNode)
        {
            return {
                type: "Forall",
                variables: [{
                    name: variableNode.sourceString,
                    typeName: typeNode.sourceString
                }],
                bodyAST: bodyNode.ast()
            };
        },

        QuanExp_forallWord(_op, variableNode, _colon, typeNode, bodyNode)
        {
            return {
                type: "Forall",
                variables: [{
                    name: variableNode.sourceString,
                    typeName: typeNode.sourceString
                }],
                bodyAST: bodyNode.ast()
            };
        },

        PowExp(e)
        {
            return e.ast(); 
        },

        PowExp_power(first, _, last)
        {
            return {
                type: "Power", 
                left: first.ast(), 
                right: last.ast()
            };
        },

        PriExp(e)
        {
            return e.ast();
        },

        PriExp_paren(_a, op, _b)
        {
            return op.ast();
        },

        Compound(name, _open, args, _closed)
        {
            return {
                type: "Compound", 
                name: name.sourceString, 
                args: args.ast()
            };
        },

        Number(_sign, _integral, _dot, _fractional)
        {
            return {
                type: "Number", 
                value: parseFloat(this.sourceString)
            };
        },

        Variable(first, rest, dottedParts)
        {
            return {
                type: "Variable", 
                name: first.sourceString + rest.sourceString + dottedParts.sourceString
            };
        }
    });

    const typeRegistry = {};
    const typeLineGrammar = ohm.grammar(String.raw`
        TypeLine {
            Definition = ("Type" Name ":")? Name "=def" Fields
            Fields = Field ("," Field)*
            Field = Name ":" Name
            Name = letter alnum*
        }
    `);
    const typeLineSemantics = typeLineGrammar.createSemantics().addOperation("ast", {
        Definition(_type, _label, _colon, name, _equalsDef, fields)
        {
            return {
                name: name.sourceString,
                fields: fields.ast()
            };
        },

        Fields(first, _comma, rest)
        {
            return [first.ast(), ...rest.children.map(field => field.ast())];
        },

        Field(name, _colon, typeName)
        {
            return {
                name: name.sourceString,
                type: typeName.sourceString
            };
        },

        Name(first, rest)
        {
            return first.sourceString + rest.sourceString;
        }
    });

    for(const rawLine of typesInput.split("\n"))
    {
        const typeLine = rawLine.trim();
        if(!typeLine)
        {
            continue;
        }

        if(typeLine.includes("=def"))
        {
            const typeMatch = typeLineGrammar.match(typeLine);
            if(!typeMatch.succeeded())
            {
                throw new Error(`Invalid type definition "${typeLine}": ${typeMatch.message}`);
            }
            const definition = typeLineSemantics(typeMatch).ast();
            typeRegistry[definition.name] = definition.fields;
            continue;
        }

        if(!typeLine.includes(":"))
        {
            continue;
        }

        const [factName, types] = typeLine.split(":");
        const cleanName = factName.trim();
        const typesArr = types.split(",").map(s => s.trim().toLowerCase());
        typeRegistry[cleanName] = typesArr;
    }

    const predicateRegistry = {};
    const definitionHeadGrammar = ohm.grammar(String.raw`
        DefinitionHead {
            Definition = "Function" Name ":" Name "(" Parameters? ")" -- function
                        | "Predicate" Name ":" Name "(" Parameters? ")" -- predicate
                        | Name "(" Parameters? ")" -- plain
            Parameters = Parameter ("," Parameter)*
            Parameter = Name (":" Name)?
            Name = letter alnum*
        }
    `);
    
    const definitionHeadSemantics = definitionHeadGrammar.createSemantics().addOperation("ast", {
        Definition_function(_function, _label, _colon, name, _open, parameters, _close)
        {
            return {
                name: name.sourceString,
                args: parameters.children.length ? parameters.children[0].ast() : []
            };
        },

        Definition_predicate(_predicate, _label, _colon, name, _open, parameters, _close)
        {
            return {
                name: name.sourceString,
                args: parameters.children.length ? parameters.children[0].ast() : []
            };
        },

        Definition_plain(name, _open, parameters, _close)
        {
            return {
                name: name.sourceString,
                args: parameters.children.length ? parameters.children[0].ast() : []
            };
        },

        Parameters(first, _comma, rest)
        {
            return [first.ast(), ...rest.children.map(parameter => parameter.ast())];
        },

        Parameter(name, _colon, optionalType)
        {
            return {
                name: name.sourceString,
                typeName: optionalType.children.length ? optionalType.children[0].sourceString : "Real"
            };
        },

        Name(first, rest)
        {
            return first.sourceString + rest.sourceString;
        }
    });

    for(const rawLine of predicatesInput.split("\n"))
    {
        const definitionLine = rawLine.trim();
        const equalsDef = definitionLine.indexOf("=def");
        if(!definitionLine || equalsDef === -1)
        {
            continue;
        }

        const head = definitionLine.slice(0, equalsDef).trim();
        const body = definitionLine.slice(equalsDef + "=def".length).trim();
        const headMatch = definitionHeadGrammar.match(head);
        if(!headMatch.succeeded())
        {
            throw new Error(`Invalid function or predicate definition "${head}": ${headMatch.message}`);
        }

        const definition = definitionHeadSemantics(headMatch).ast();
        const bodyMatch = grammar.match(body, "Exp");
        if(!bodyMatch.succeeded())
        {
            throw new Error(`Invalid definition body for "${definition.name}": ${bodyMatch.message}`);
        }

        predicateRegistry[definition.name] = {
            args: definition.args,
            bodyAST: semantics(bodyMatch).ast()
        };
    }

    const m = grammar.match(`${userInput}`);
    
    if(m.succeeded())
    {
        const ast = semantics(m).ast();
        const currentFacts = normalizeFactIds(facts);
        const nextFactId = {
            value: getNextFactId(currentFacts)
        };
        const firedActivations = new Set();
        let result = {
            fired: false,
            facts: currentFacts
        };
        
        // result = await executeRules(ctx, Solver, ast, result, typeRegistry, predicateRegistry, firedActivations, nextFactId);
        result = await executeRules(ctx, Solver, ast, result, typeRegistry, predicateRegistry, firedActivations, nextFactId);

        return {
            succeeded: true,
            fired: result.fired,
            facts: result.facts
        };

    }
    else
    {
        return {
            succeeded: false, 
            error: m.message, 
            facts: facts
        };
    }
    

}


//----------------------------------------------------------------------

export async function restoreFile(file, setCircles, setConnections, setInformation)
{
    const fileData = await file.text();
    const restoreObj = await JSON.parse(fileData);

    if(!restoreObj)
    {
        return {};
    }

    setCircles(restoreObj.circles ?? []);
    setConnections(restoreObj.connections ?? []);
    setInformation(restoreObj.information ?? []);

    return restoreObj.fileId;
}