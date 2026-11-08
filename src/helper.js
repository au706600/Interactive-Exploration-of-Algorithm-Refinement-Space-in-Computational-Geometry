// Used for testing

import * as ohm from 'ohm-js';
import { init } from 'z3-solver';
const { Context } = await init();
const ctx = new Context("main");
const { Function, Solver, Int, And, Implies } = ctx;

// https://ohmjs.org/docs/intro
// https://jsfiddle.net/pdubroy/15k63qae/

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

const operation = (node, ctx) => {
    switch(node.type) {
        case "Number": 
            return ctx.Int.val(node.value);
            // return node.value;

        case "Variable":
            return ctx.Int.const(node.name);
            // return node.name;

        case "Add":
            return operation(node.left, ctx).add(operation(node.right, ctx));
            //return operation(node.left) + operation(node.right);
        
        case "Subtract":
            return operation(node.left, ctx).sub(operation(node.right, ctx));
            //return operation(node.left) - operation(node.right);

        case "Multiply":
            return operation(node.left, ctx).mul(operation(node.right, ctx));
            //return operation(node.left) * operation(node.right);

        case "Divide":
            return operation(node.left, ctx).div(operation(node.right, ctx));
            //return operation(node.left) / operation(node.right);

        case "Lessthan":
            return operation(node.left, ctx).lt(operation(node.right, ctx));
            //return operation(node.left) < operation(node.right);

        case "Biggerthan":
            return operation(node.left, ctx).gt(operation(node.right, ctx));
            //return operation(node.left) > operation(node.right);
        
        case "Equal":
            return operation(node.left, ctx).eq(operation(node.right, ctx));
            //return operation(node.left) === operation(node.right);

        default: 
            console.log("Unknown type");
    }
}

async function solve(userInput)
{
    const myArithmetic = String.raw`
    MyArithmetic {
        Exp = AddExp 
        
        AddExp = AddExp "+" PriExp -- plus
                | AddExp "-" PriExp -- minus
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
    }
`; 

    const grammar = ohm.grammar(myArithmetic); 


    const semantics = grammar.createSemantics().addOperation("ast", {
        Exp(e)
        {
            return e.ast();
        },
        AddExp(e)
        {
            return e.ast();
        },
        AddExp_plus(a, _, b)
        {
            return {
                type: "Add", 
                left: a.ast(),
                right: b.ast()
            }
        },
        AddExp_minus(a, _, b)
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
                value: parseInt(digits.sourceString)
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

    /*
    const x = Int.const('x');
    const y = Int.const('y');

    const m = grammar.match(`${x} < ${y}`);
    */

    //const m = grammar.match("x < y");

    const m = grammar.match(`${userInput}`);

    if(m.succeeded())
    {
        const ast = semantics(m).ast();
        const solver = new Solver();
        

        const constraint = operation(ast, ctx);
        solver.add(constraint);

        // Test 1 -- Returns sat
        //solver.add(x.gt(10));

        // Test 2 -- Returns unsat
        //solver.add(And(x.gt(10), x.lt(5)));

        // Test 3 -- Returns sat
        //solver.add(And(x.eq(5), y.eq(10)));

        // Test 4 - Returns sat
        //solver.add(x.add(y).eq(10));
        //solver.add(x.eq(4));

        /*

        console.log("x solved as: ", await solver.check());
        const model = solver.model();
        //console.log("x solved: ", model.eval(x).toString());
        console.log(model.toString()); 

        */

        const resultSolver = await solver.check();
        
        if(resultSolver === "sat")
        {
            const model = solver.model();
            const getRes = getResult(ast);
            const variables = {};

            for(const name of Object.keys(getRes))
            {
                const variable = ctx.Int.const(name);
                variables[name] = model.eval(variable).toString();
            }
            
            return {
                resultSolver,
                model: variables
            }
        }

        return {
            resultSolver, 
            model: null
        }

    }

    else
    {
        console.error("m error: ", m.message);
        return null;
    }
}


console.log("Solve x < y: ", await solve("x < x"));



/*
if(m.succeeded())
{
    console.log("AST object: ", semantics(m).ast());
    console.log("Value: ", operation(semantics(m).ast()));
} 
else
{
    console.error("m error: ", m.message);
}

*/


//----------------------------------------------------------------------

/*
// Find number that fulfills x >= 0 and x >= 9
const x = Int.const('x'); 

const solver = new Solver();

solver.add(And(x.ge(0), x.ge(9))); // Greater than or equal

console.log("x solved as: ", await solver.check());
const model = solver.model();
console.log("x solved: ", model.eval(x).toString());
*/

//----------------------------------------------------------------------

/*
// x = y => g(x) = g(y)

const sort = Int.sort();
const num1 = Int.const('num1');
const num2 = Int.const('num2');  
const solver = new Solver(); 
const g = Function.declare('g', sort, sort);
const conjecture = Implies(num1.eq(num2), g.call(num1).eq(g.call(num2)));
solver.add(conjecture);

console.log("x solved as: ", await solver.check());
const model = solver.model();
console.log("x solved as model: ", model.eval(num1).toString());
console.log("y solved as model: ", model.eval(num2).toString());
*/

//----------------------------------------------------------------


