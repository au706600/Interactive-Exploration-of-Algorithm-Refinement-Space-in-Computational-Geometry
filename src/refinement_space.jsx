import { useState, useRef } from 'react';
import './refinement_space.css';
import Draggable from 'react-draggable';
import Program_inspector from './program_inspector.jsx';


function Refinement_space()
{
    const [circles, setCircles] = useState([]);
    const [inspector, setInspector] = useState(false);
    const padding = 30;
    const spacing = 40;
    const circleRef = useRef(new Map());
    const width = 600;

    function showInspector()
    {
        setInspector(true);
    }

    const circleRefs = (id) => {
        if(!circleRef.current.has(id))
        {
            circleRef.current.set(id, {current: null})
        }

        return circleRef.current.get(id);
    }

    const addCircles = (e) => {
        e.preventDefault();
        
        setCircles((element) => {
            const maxCols = Math.floor((width - padding * 2) / spacing);
            const col = element.length % maxCols;
            const row = Math.floor(element.length / maxCols);
            const nextx = padding + col * spacing;
            const nexty = padding + row * spacing;

            const circleObj = {
                id: crypto.randomUUID(), 
                x: nextx, 
                y: nexty
            }

            return [...element, circleObj];
        });
    }

    return(
        <div className="container_computation">
            <div className="navbar">
                <ul>
                    <li><a href="#">Program1</a></li>
                    <li><a href="#">Program2</a></li>
                    <li><a href="#">Program3</a></li>
                    <li><a href="#">Program4</a></li>
                </ul>
            </div>
            <div className="refinement_container">
                <div className="refinement_window">
                    {
                        circles.map((element) => {
                            const nodeRefs = circleRefs(element.id);
                            
                            return (
                                <Draggable
                                    key={element.id}
                                    bounds="parent"
                                    nodeRef={nodeRefs}
                                    onStop={(e, data) => (
                                        setCircles((prev) => 
                                            prev.map((circle) => 
                                                (circle.id === element.id) ? {
                                                ...circle,
                                                x: data.x, 
                                                y: data.y
                                                }
                                                : circle
                                            )
                                        )
                                    )}
                                > 
                                    <div
                                        onClick={showInspector} 
                                        ref={nodeRefs}
                                        className="refinement_circles"
                                    />
                                </Draggable>
                            );
                        })
                    }
                </div>
                <button 
                className="add_circle_btn" 
                type="button"
                onClick={addCircles}> + </button>
            </div>
            {
                inspector ? <Program_inspector /> : null
            }
        </div>
    )
}


export default Refinement_space