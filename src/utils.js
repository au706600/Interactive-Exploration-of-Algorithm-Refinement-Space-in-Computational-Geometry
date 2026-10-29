
import * as ohm from 'ohm-js';
import { init } from 'z3-solver';
const { Context } = await init();
const ctx = new Context("main");
const { Solver, Int} = ctx;

//----------------------------------------------------------------------

function getResult(node, variables = {})
{
    if(node.type === "Variable")
    {
        variables[node.name] = true;
    }

    if(node.left)
    {
        getResult(node.left, variables);
    }

    if(node.right)
    {
        getResult(node.right, variables);
    }

    return variables;
}

const operation = (node, ctx, bindings = {}) => {
    
    switch(node.type){
        case "Number":
            return ctx.Real.val(node.value);

        case "Variable":
            return ctx.Real.const(bindings[node.name]);

        case "Add":
            return operation(node.left, ctx, bindings).add(operation(node.right, ctx, bindings));

        case "Subtract":
            return operation(node.left, ctx, bindings).sub(operation(node.right, ctx, bindings));

        case "Multiply":
            return operation(node.left, ctx, bindings).mul(operation(node.right, ctx, bindings));

        case "Divide":
            return operation(node.left, ctx, bindings).div(operation(node.right, ctx, bindings));

        case "Lessthan":
            return operation(node.left, ctx, bindings).lt(operation(node.right, ctx, bindings));

        case "Biggerthan":
            return operation(node.left, ctx, bindings).gt(operation(node.right, ctx, bindings));
        
        case "Equal":
            return operation(node.left, ctx, bindings).eq(operation(node.right, ctx, bindings)); 

        default: 
            console.log("Unknown type");
    }
}

function findMatches(keep, remove, facts)
{
    const patterns = [...keep, ...remove];
    const result = [];

    function matchStage(patternIdx, currentMatchIdx, boundVars)
    {
        if(patternIdx === patterns.length)
        {
            result.push({
                keepIndices: currentMatchIdx.slice(0, keep.length),
                removeIndices: currentMatchIdx.slice(keep.length),
                boundVars: {...boundVars}
            });
            return;
        }

        const pattern = patterns[patternIdx];
        const patternArgsLen = pattern.args.length;

        for(let i = 0; i < facts.length; i++)
        {
            if(currentMatchIdx.includes(i))
            {
                continue;
            }

            const fact = facts[i];
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

            if(!mismatch)
            {
                currentMatchIdx.push(i);
                matchStage(patternIdx + 1, currentMatchIdx, nextboundVars);
                currentMatchIdx.pop();
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

export async function fireRule(node, ctx, facts)
{
    /*
        Read the parsed rule AST.

        Find candidate facts matching the rule's Keep and Remove patterns.

        Create a Z3 environment mapping rule variables to Z3 expressions.

        Translate the guard AST using operation() function.

        Add the guard to a solver and check satisfiability.

        For a satisfying match, evaluate the Added expressions and update the fact store according to the rule semantics.
    */

    const candidates = findMatches(node.keep, node.remove, facts);

    for(const candidate of candidates)
    {
        const bindings = {};
        const solver = new Solver();

        const guardVars = collectVariables(node.guard);

        for(const varName of guardVars)
        {
            bindings[varName] = varName;
        }

        for(const varName of Object.keys(candidate.boundVars))
        {
            bindings[varName] = varName;
        }

        const constraint = operation(node.guard, ctx, bindings);
        solver.add(constraint);

        for(const [varName, value] of Object.entries(candidate.boundVars))
        {
            solver.add(ctx.Real.const(varName).eq(ctx.Real.val(value)));
        }

        const resultSolver = await solver.check();

        if(resultSolver === "sat")
        {
            const model = solver.model();
            const updatedFacts = facts.filter((_, idx) => !candidate.removeIndices.includes(idx));

            for(const addedPattern of node.added)
            {
                const newArgs = addedPattern.args.map(arg => {
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

                        const valStr = model.eval(ctx.Real.const(arg.name)).toString();
                        return parseFloat(valStr);
                    }
                });

                updatedFacts.push({
                    name: addedPattern.name,
                    args: newArgs
                });
            }

            return {
                fired: true, 
                facts: updatedFacts
            };
        }
    }

    return {
        fired: false,
        facts: facts
    };
}

export async function solve(userInput)
{
    const myArithmetic = String.raw`
    MyArithmetic
    {
    
        Rule = Keep "/" Remove "=>" Guard "|" Added

        Keep = Factlist
        Remove = Factlist
        Added = Factlist

        Factlist = Fact(",", Fact)*
        Fact = Variable "(" Arglist ")" 
        Arglist = Argument ("," Argument)*
        
        Argument = Variable | Number 

        Guard = Exp

        Exp = AddExp

        AddExp = AddExp "+" PriExp -- add
        | AddExp "-" PriExp -- subtract
        | AddExp "*" PriExp -- multiply
        | AddExp "/" PriExp -- divide 
        | AddExp "<" PriExp -- lessthan
                | AddExp ">" PriExp -- biggerthan
                | AddExp "===" PriExp -- equal
                | PriExp

        PriExp = "(" Exp ")" -- paren
                | Number
                | Variable
                
        Number = digit+
        Variable = letter alnum*
    }`

    const grammar = ohm.grammar(myArithmetic);

    const semantics = grammar.createSemantics().addOperation("ast", {

        Keep(e)
        {
            return e.ast();
        },

        Remove(e)
        {
            return e.ast();
        },

        Added(e)
        {
            return e.ast();
        },

        Factlist(first, rest)
        {
            return [
                first.ast(), 
                ...rest.children.map(fact => fact.ast())
            ];
        },

        Fact(name, _, args)
        {
            return {
                type: "Fact", 
                name: name.sourceString,
                args: args.ast()
            }
        },

        Arglist(first, rest)
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

        Rule(_keep, _slash, _remove, _leads_to , _guard, _pipe, _added){
            return {
                type: "Rule", 
                keep: _keep.ast(), 
                slash: _slash.ast(), 
                remove: _remove.ast(), 
                leads_to: _leads_to.ast(),
                guard: _guard.ast(),
                pipe: _pipe.ast(),
                added: _added.ast()
            }
        },
        
        Guard(e)
        {
            return e.ast();
        },

        Exp(e)
        {
            return e.ast();
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
            }
        },

        AddExp_substract(a, _, b)
        {
            return {
                type: "Subtract", 
                left: a.ast(), 
                right: b.ast()
            }
        },

        AddExp_multiply(a, _, b)
        {
            return {
                type: "Multiply", 
                left: a.ast(), 
                right: b.ast()
            }
        }, 

        AddExp_divide(a, _, b)
        {
            return {
                type: "Divide", 
                left: a.ast(), 
                right: b.ast()
            }
        },
        
        AddExp_lessthan(a, _, b)
        {
            return {
                type: "Lessthan",
                left: a.ast(), 
                right: b.ast()
            }
        },

        AddExp_biggerthan(a, _, b)
        {
            return {
                type: "Biggerthan", 
                left: a.ast(), 
                right: b.ast()
            }
        }, 

        AddExp_equal(a, _, b)
        {
            return {
                type: "Equal", 
                left: a.ast(), 
                right: b.ast()
            }
        },

        PriExp(e)
        {
            return e.ast();
        },

        PriExp_paren(a, op, b)
        {
            return op.ast();
        },

        Number(digits)
        {
            return {
                type: "Number", 
                value: parseFloat(digits.sourceString)
            };
        },

        Variable(first, rest)
        {
            return {
                type: "Variable", 
                name: first.sourceString + rest.sourceString
            }
        }
    });

    const m = grammar.match(`${userInput}`);
    
    if(m.succeeded())
    {
        const ast = semantics(m).ast();
        const constraint = operation(ast, ctx);
        
        const solver = new Solver();
        solver.add(constraint);
        const resultSolver = await solver.check();

        if(resultSolver === "sat")
        {
            const getRes = getResult(ast);
            const variables = {};
            const model = solver.model();

            for(const name of Object.keys(getRes))
            {
                const variable = ctx.Real.const(name);
                variables[name] = model.eval(variable).toString();
            }

            return {
                resultSolver, 
                model: variables
            }
        }
        else
        {
            return {
                resultSolver, 
                model: null
            }
        }
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