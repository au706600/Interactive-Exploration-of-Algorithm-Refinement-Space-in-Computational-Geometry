import { useState } from "react";
import './program_inspector.css'

function Program_inspector()
{
    const [result, setResult] = useState("");
    const [types, setTypes] = useState("");
    const [predicates, setPredicates] = useState("");
    const [rules, setRules] = useState("");
    const [mapping, setMapping] = useState("");
    const [viewRefinement, setViewRefinement] = useState("");
    const [storageValue, setStorageValue] = useState("");

    function showResult(e)
    {
        e.preventDefault();
        const message = "Data returned, congrats!";
        setResult("Data returned, congrats!");
        alert(message);
    }

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
                            placeholder="Predicates"
                            value={predicates}
                            onChange={(e) => setPredicates(e.target.value)}
                            rows="4"
                        />
                    </label>
                </div>
                <div className="rules_box">
                    <label>
                        <textarea 
                            placeholder="Rules"
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
                            placeholder="Store values"
                            value={storageValue}
                            onChange={(e) => setStorageValue(e.target.value)}
                            rows="2"
                        />
                    </label>
                </div>
                <button onClick={showResult} disabled={!types || !predicates || !rules || !mapping || !viewRefinement || !storageValue }> Run </button>
            </div>
    )
}


export default Program_inspector;