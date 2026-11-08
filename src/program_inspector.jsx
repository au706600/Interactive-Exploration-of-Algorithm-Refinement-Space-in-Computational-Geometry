import { useState, useEffect } from "react";
import './program_inspector.css'
import { solve, parseFactStoreText, serializeFacts } from './utils.js';

function Program_inspector({inspector_id, file_id})
{
    const [result, setResult] = useState("");
    const [types, setTypes] = useState(
        () => {
           const typesStorage = localStorage.getItem(`types_${inspector_id}_${file_id}`);
           return typesStorage || "";
        }
    );

    const [predicates, setPredicates] = useState(
        () => {
            const predicateStorage = localStorage.getItem(`predicates_${inspector_id}_${file_id}`);
            return predicateStorage || "";
        }
    );

    const [rules, setRules] = useState(
        () => {
            const ruleStorage = localStorage.getItem(`rules_${inspector_id}_${file_id}`);
            return ruleStorage || "";
        }
    );

    const [mapping, setMapping] = useState(
        () => {
            const mappingStorage = localStorage.getItem(`mapping_${inspector_id}_${file_id}`);
            return mappingStorage || "";
        }
    );

    const [viewRefinement, setViewRefinement] = useState("");
    const [storageValue, setStorageValue] = useState(
        () => {
            const storageValueStorage = localStorage.getItem(`storageValue_${inspector_id}_${file_id}`);
            return storageValueStorage || "";
        }
    );

    async function showResult(e)
    {
        e.preventDefault();

        //const currentFacts = storageValue ? JSON.parse(storageValue) : [];
        const currentFacts = parseFactStoreText(storageValue);

        try
        {
            const response = await solve(rules, currentFacts, types, predicates);

            if(response.succeeded)
            {
                if(response.fired)
                {
                    //const newString = JSON.stringify(response.facts, null, 2);
                    const newString = serializeFacts(response.facts);
                    setStorageValue(newString);
                    setResult("Fact store updated");
                    alert("Match found");
                }

                else
                {
                    setResult("No match found");
                    alert("No match found");
                }
            }
            else
            {
                setResult(`Syntax error: ${response.error}`);
                alert(`${response.error}`);
            }
        }
        catch(error)
        {
            if(error.message.includes("Execution limit reached"))
            {
                setResult("Execution limit is reached");
                alert("Execution limit reached");
            }
        }

        /*
        const message = "Data returned, congrats!";
        setResult("Data returned, congrats!");
        alert(message);
        */
    }

    useEffect(() => {
        localStorage.setItem(`types_${inspector_id}_${file_id}`, types);
        localStorage.setItem(`predicates_${inspector_id}_${file_id}`, predicates);
        localStorage.setItem(`rules_${inspector_id}_${file_id}`, rules);
        localStorage.setItem(`mapping_${inspector_id}_${file_id}`, mapping);
        localStorage.setItem(`storageValue_${inspector_id}_${file_id}`, storageValue);
    }, [types, predicates, rules, mapping, storageValue]);

    return (
            <div className="program_container">
                <div className="types_box">
                    <label>
                        <textarea
                            placeholder="Types"
                            value={types}
                            onChange={(e) => setTypes(e.target.value)}
                            rows="2"
                        />
                    </label>
                </div>
                <div className="predicates_box">
                    <label>
                        <textarea 
                            placeholder={"Predicates"}
                            value={predicates}
                            onChange={(e) => setPredicates(e.target.value)}
                            rows="4"
                        />
                    </label>
                </div>
                <div className="rules_box">
                    <label>
                        <textarea 
                            placeholder={"Rules"}
                            value={rules}
                            onChange={(e) => setRules(e.target.value)}
                            rows="2"
                        />
                    </label>
                </div>
                <div className="mapping_box">
                    <label>
                        <textarea
                            placeholder="Mapping"
                            value={mapping}
                            onChange={(e) => setMapping(e.target.value)}
                            rows="4"
                        />
                    </label>
                </div>

                <div className="view_refinement">
                    <label>
                        <textarea
                            placeholder="View refinement"
                            value={viewRefinement}
                            onChange={(e) => setViewRefinement(e.target.value)}
                            rows="4"
                        />
                    </label>
                </div>

                <div className="store_box">
                    <label>
                        <textarea
                            placeholder={"Store values"}
                            value={storageValue}
                            onChange={(e) => setStorageValue(e.target.value)} 
                            rows="2"
                        />
                    </label>
                </div>
                <button onClick={showResult} disabled={!rules || !storageValue }> Run </button>
            </div>
    )
}


export default Program_inspector;