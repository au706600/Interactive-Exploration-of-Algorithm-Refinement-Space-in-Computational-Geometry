
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

const operation = (node, ctx, bindings = {}, typeRegistry = {}, predicateRegistry = {}) => {
    
    switch(node.type){ 
        case "Number":
            return ctx.Real.val(node.value);

        case "Variable":

            if (bindings[node.name] !== undefined) {
                return bindings[node.name];
            }
            return ctx.Real.const(node.name);

        case "Fact":
            if(predicateRegistry[node.name])
            {
                const nodePredicate = predicateRegistry[node.name];
                const localBindings = {...bindings};

                nodePredicate.args.forEach((arg, idx) => {
                    const argNode = node.args[idx];
                    if(argNode.type === "Variable")
                    {
                        localBindings[arg] = bindings[argNode.name] !== undefined ? bindings[argNode.name] : ctx.Real.const(argNode.name);
                    }
                    else if(argNode.type === "Number")
                    {
                        localBindings[arg] = ctx.Real.val(argNode.value);
                    }
                });

                return operation(nodePredicate.bodyAST, ctx, localBindings, typeRegistry, predicateRegistry);
            }

        case "Add":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).add(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Subtract":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).sub(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Multiply":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).mul(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Divide":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).div(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Lessthan":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).lt(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Biggerthan":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).gt(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));
        
        case "Equal":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).eq(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "NotEqual":
            return ctx.Not(operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).eq(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry)));

        case "LessthanEqual":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).le(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "BiggerthanEqual":
            return operation(node.left, ctx, bindings, typeRegistry, predicateRegistry).ge(operation(node.right, ctx, bindings, typeRegistry, predicateRegistry));

        case "Exists":

            const boundVarsExists = node.variables.map(v => ctx.Real.const(v.name));
            const extendedBindings = {...bindings};

            node.variables.forEach((v, idx) => {
                extendedBindings[v.name] = boundVarsExists[idx];
            });

            const optExists = operation(node.bodyAST, ctx, extendedBindings, typeRegistry, predicateRegistry);
            return ctx.Exists(boundVarsExists, optExists);

        case "Forall":
            const boundVarsForall = node.variables.map(v => ctx.Real.const(v.name));
            const extendBindings = {...bindings};

            node.variables.forEach((v, idx) => {
                extendBindings[v.name] = boundVarsForall[idx];
            }); 

            const optForall = operation(node.bodyAST, ctx, extendBindings, typeRegistry, predicateRegistry);
            return ctx.ForAll(boundVarsForall, optForall);

        case "Power":
            const left = operation(node.left, ctx, bindings, typeRegistry, predicateRegistry);
            const right = operation(node.right, ctx, bindings, typeRegistry, predicateRegistry); 
            return left.pow(right); 
            
        case "And": 
            const expr = node.expressions.map(e => operation(e, ctx, bindings, typeRegistry, predicateRegistry));
            return expr.length > 0 ? ctx.And(...expr) : ctx.Bool.val(true);

        default: 
            console.log("Unknown type");
    }
}

/*
    FireRule - Checks the guard and executes one particular activation
    executeRules - Controls rule ordering, repetition and termination
*/

function findMatches(keep, remove, facts)
{
    const patterns = [...keep, ...remove];
    const result = [];

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

        // Determines the number of arguments the pattern that we want to match have
        const patternArgsLen = pattern.args.length;
        
        for(let i = 0; i < facts.length; i++)
        { 
            const fact = facts[i];

            // Check that the current match contains the id of our fact. If it does skip
            if(currentMatchIds.includes(fact.id))
            {
                continue;
            }

            // If the name or the number of arguments doesn't match the current pattern, skip
            if(fact.name !== pattern.name || fact.args.length !== pattern.args.length)
            {
                continue;
            }

            const nextboundVars = {...boundVars};
            let mismatch = false;
        
            for(let j = 0; j < patternArgsLen; j++)
            {
                const pArg = pattern.args[j];
                const fArg = fact.args[j];

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
        vars.add(node.name);
    }

    if(node.type === "Fact" && node.args)
    {
        node.args.forEach(arg => collectVariables(arg, vars));
    }

    if(node.left)
    {
        collectVariables(node.left, vars);
    }

    if(node.right)
    {
        collectVariables(node.right, vars);
    }

    return vars;
}

function activationKey(ruleIdx, candidate)
{
    return `${ruleIdx}:${candidate.matchIds.join(",")}`;
}

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

// Function for prevent duplicate ID's
function getNextFactId(facts)
{
    return facts.reduce((maxId, fact) => {
        return typeof fact.id === "number" && fact.id > maxId ? fact.id : maxId;
    }, 0) + 1;
}

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
            const factTypes = typeRegistry[pattern.name] || [];
            pattern.args.forEach((arg, idx) => {
                if (arg.type === "Variable") {
                    knownVarTypes[arg.name] = (factTypes[idx] === "int") ? "int" : "real";
                }
            });
        });


        const guardVars = collectVariables(node.guard);

        for(const varName of guardVars)
        {
            const isInt = knownVarTypes[varName] === "int";
            bindings[varName] = isInt ? ctx.Int.const(varName) : ctx.Real.const(varName);
            //bindings[varName] = varName;
        }

        for(const varName of Object.keys(candidate.boundVars))
        {
            const isInt = knownVarTypes[varName] === "int";
            bindings[varName] = isInt ? ctx.Int.const(varName) : ctx.Real.const(varName);
            //bindings[varName] = varName;
        }

        const constraint = operation(node.guard, ctx, bindings, typeRegistry, predicateRegistry);
        solver.add(constraint);

        // Adds a solver constraint for each variable matched from the facts
        for(const [varName, value] of Object.entries(candidate.boundVars))
        {
        
            const isInt = knownVarTypes[varName] === "int";

            if(isInt)
            {
                solver.add(bindings[varName].eq(ctx.Int.val(Number(value))));
            }
            else
            {
                solver.add(bindings[varName].eq(ctx.Real.val(Number(value))));
            }

        }

        const resultSolver = await solver.check();

        if(resultSolver === "sat")
        {
            const model = solver.model();
            const factsToRemove = new Set(candidate.removeIds);
            const updatedFacts = facts.filter(fact => !factsToRemove.has(fact.id));

            // Creates each fact on the rule's right-hand side
            for(const addedPattern of node.added)
            {
                const newArgs = addedPattern.args.map((arg, idx) => {
                    if(arg.type === "Number")
                    {
                        return arg.value;
                    }

                    else if(arg.type === "Variable")
                    {
                        if(arg.name in candidate.boundVars)
                        {
                            return candidate.boundVars[arg.name];
                        }

                        const factTypes = typeRegistry[addedPattern.name];
                        const isInt = factTypes && factTypes[idx] === "int";
                        const checkType = isInt ? ctx.Int.const(arg.name) : ctx.Real.const(arg.name);
                        const valStr = model.eval(checkType).toString();
                        return parseFloat(valStr);

                    }
                });

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
            Argument = float | signedInt | int
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
            return parseFloat(e.sourceString);
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

export function serializeFacts(factsArr)
{
    return factsArr.map(f => `${f.name}(${f.args.join(", ")})`).join(", ");
}

export async function solve(userInput, facts, typesInput = "", predicatesInput = "")
{
    const { ctx, Solver } = await getZ3Context();

    const myArithmetic = String.raw`
    MyArithmetic
    {
        Program = Rule+
        Rule = Keep "/" Remove "=>" Guard "|" Added "."?

        Keep = Factlist?
        Remove = Factlist?
        Added = Factlist?

        Factlist = Fact ("," Fact)*
        Fact = Variable "(" Arglist ")" 
        Arglist = Argument ("," Argument)*
        
        Argument = Variable | Number 

        Guard = Explist?

        Explist = Exp ("," Exp)*

        Exp = QuanExp

        QuanExp = "E" Variable ":" Variable Exp -- exists
                | "exists" Variable ":" Variable Exp -- existsWord
                | "All" Variable ":" Variable Exp -- forall
                | "Forall" Variable ":" Variable Exp -- forallCaps
                | "forall" Variable ":" Variable Exp -- forallWord
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
                
        Number = "-"? digit+ ("." digit+)?
        Variable = letter alnum*
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

        Rule(_keep, _slash, _remove, _leads_to , _guard, _pipe, _added, _period){
            return {
                type: "Rule", 
                keep: _keep.ast(), 
                remove: _remove.ast(), 
                guard: _guard.ast(),
                added: _added.ast()
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

        Number(_sign, _integral, _dot, _fractional)
        {
            return {
                type: "Number", 
                value: parseFloat(this.sourceString)
            };
        },

        Variable(first, rest)
        {
            return {
                type: "Variable", 
                name: first.sourceString + rest.sourceString
            };
        }
    });

    const typeRegistry = {};
    if(typesInput.trim())
    {
        const typeLines = typesInput.split("\n");
        for(const typeLine of typeLines)
        {
            if(!typeLine.includes(":"))
            {
                continue;
            }
            const [factName, types] = typeLine.split(":");
            const cleanName = factName.trim();
            const typesArr = types.split(",").map(s => s.trim().toLowerCase());
            typeRegistry[cleanName] = typesArr;
        }
    }

    const predicateRegistry = {};
    if(predicatesInput.trim())
    {
        const predicateLines = predicatesInput.split("\n");
        
        const predicateDef = String.raw`
        predicateDef {
            Definition = Name "(" Arglist ")"
            Arglist = Name ("," Name)*
            Name = letter alnum*
        }
        `;

        const predicateGrammar = ohm.grammar(predicateDef);
        const semanticsPredicates = predicateGrammar.createSemantics().addOperation("ast", {
            Definition(name, _start, args, _end)
            {
                return {
                    name: name.sourceString, 
                    args: args.ast()
                };
            }, 

            Arglist(first, _, rest)
            {
                return [
                    first.sourceString, 
                    ...rest.children.map(c => c.sourceString)
                ];
            }, 

            Name(first, rest)
            {
                return first.sourceString + rest.sourceString;
            }
        });

        for(const predicate of predicateLines)
        {
            if(!predicate.includes("=def"))
            {
                continue;
            }

            const [predicateHead, predicateBody] = predicate.split("=def");
            const m = predicateGrammar.match(predicateHead.trim());
            if(!m.succeeded())
            {
                throw new Error(`Invalid predicate definition: "${predicateHead.trim()}".`);
            }

            const parseHead = semanticsPredicates(m).ast();
            const bodyMatch = grammar.match(predicateBody.trim(), 'Exp');

            if(!bodyMatch.succeeded())
            {
                throw new Error(`Invalid definition body for predicate "${parseHead.name}": ${bodyMatch.message}`);
            }

            predicateRegistry[parseHead.name] = {
                args: parseHead.args,
                bodyAST: semantics(bodyMatch).ast()
            };
        }

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