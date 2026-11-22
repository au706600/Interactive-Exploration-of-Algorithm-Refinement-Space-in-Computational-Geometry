import { useState, useEffect } from "react";
import './program_inspector.css'
import { solve, parseFactStoreText, serializeFacts } from './utils.js';
import { get, set } from 'idb-keyval';

function Program_inspector({inspector_id, file_id})
{
    const [result, setResult] = useState("");
    const [types, setTypes] = useState("");
    const [predicates, setPredicates] = useState("");
    const [rules, setRules] = useState("");
    const [mapping, setMapping] = useState("");
    const [viewRefinement, setViewRefinement] = useState("");
    const [storageValue, setStorageValue] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);
    const [currentFileId, setCurrentFileId] = useState(
        () => localStorage.getItem("activeFileId") || null
    );

    const storageKey = `inspector_${inspector_id}_${file_id ?? "default"}`;
    
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

        if(currentFileId)
        {
            localStorage.setItem("activeFileId", currentFileId);
        }
        else
        {
            localStorage.removeItem("activeFileId");
        }
    }, [currentFileId]);

    useEffect(() => {

        let isMounted = true;
        setIsLoaded(false);

        async function loadSavedData()
        {
            let saved = await get(storageKey);

            if(isMounted)
            {
                if(saved)
                {
                    setTypes(saved.types ?? "");
                    setPredicates(saved.predicates ?? "");
                    setRules(saved.rules ?? "");
                    setStorageValue(saved.storageValue ?? "");
                }
                else
                {
                    setTypes("");
                    setPredicates("");
                    setRules("");
                    setStorageValue("");
                }
                setIsLoaded(true);
            }
        }

        loadSavedData();

        return () => {
            isMounted = false;
        }
    },[storageKey]);
    
    useEffect(() => {
        
        if(!isLoaded)
        {
            return;
        }

        const timeoutId = setTimeout(() => {
            set(storageKey, {
                types,
                predicates, 
                rules, 
                storageValue
            });
        }, 300);

        return () => clearTimeout(timeoutId);

    }, [types, predicates, rules, storageValue, isLoaded, storageKey]);

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