
import './Introduction.css';

function Introduction()
{
    return(
        <div className="intro-container">
            <div className="intro-window">
                <h2> Guide to Gaia tool </h2>
                <div className="intro-guides">
                    <div className="first_step">
                        <h3>Built</h3>
                        <p>
                            Create an algorithm node and define its types, rules, predicates, and functions. 
                        </p>
                    </div>
                    <div className="second_step">
                        <h3>Refine</h3>
                        <p>
                            Click a node and explore its refinement spaces. Each connected node represents a possible refinement of the algorithm
                        </p>
                    </div>
                    <div className="third_step">
                        <h3>Test</h3>
                        <p>
                            Generate test data. 
                        </p>
                    </div>
                    <p><strong>Tip:</strong> Click any node to inspect</p>
                </div>
            </div>
        </div>
    )
}


export default Introduction