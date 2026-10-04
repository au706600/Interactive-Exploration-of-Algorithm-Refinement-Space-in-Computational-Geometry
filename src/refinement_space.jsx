import { useState, useRef } from 'react';
import './refinement_space.css';
import Draggable from 'react-draggable';
import Program_inspector from './program_inspector.jsx';
import Introduction from './Introduction.jsx';

function Refinement_space()
{
    const [circles, setCircles] = useState([]);
    const [connections, setConnections] = useState([]);
    const [activeSourceNodeId, setActiveSourceNodeId] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const padding = 30;
    const spacing = 40;
    const circleRef = useRef(new Map());
    const width = 600;
    const isDragging = useRef(false);

    function handleToggle()
    {
        setIsVisible(!isVisible);
    }

    function randomColor()
    {
        return 'rgb(' + (Math.floor(Math.random() * 256)) + ',' + (Math.floor(Math.random() * 256)) + ',' + (Math.floor(Math.random() * 256)) + ')';
    }

    function getCoordinatesEdge(source, target)
    {
        const radius = 10;

        if(!source || !target)
        {
            return null;
        }
        
        const dx = target.x - source.x;
        const dy = target.y - source.y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if(distance === 0)
        {
            return null;
        }


        const unitX = dx/distance;
        const unitY = dy/distance;

        return {
            x1: source.x + unitX * radius,
            y1: source.y + unitY * radius,
            x2: target.x - unitX * radius, 
            y2: target.y - unitY * radius
        }
        
    }
    
    function handleClickNode(circleId)
    {
        if(activeSourceNodeId === null)
        {
            setActiveSourceNodeId(circleId);
        }

        else
        {
            if(activeSourceNodeId !== circleId)
            {
                setConnections((prev) => [
                    ...prev, 
                    {
                        from: activeSourceNodeId, 
                        to: circleId
                    }
                ]);
            }

            setActiveSourceNodeId(null);
        }
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
            let nextx = padding + col * spacing;
            let nexty = padding + row * spacing;

            const circleObj = {
                id: crypto.randomUUID(), 
                x: nextx, 
                y: nexty,
                color: randomColor()
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

                            const selectedNode = activeSourceNodeId === element.id;
                            isDragging.current = false;
                            
                            return (
                                <Draggable
                                    key={element.id}
                                    bounds="parent"
                                    nodeRef={nodeRefs}
                                    defaultPosition={{
                                        x: element.x,
                                        y: element.y
                                    }}

                                    onDrag={() => {
                                        isDragging.current = true;
                                    }}
                                    
                                    onStop={(e, data) => {

                                        if(!isDragging.current)
                                        {
                                            handleClickNode(element.id);
                                            handleToggle();
                                        }

                                        {
                                            setCircles((prev) => 
                                                prev.map((circle) => 
                                                    (circle.id === element.id) ? {
                                                    ...circle,
                                                    x: data.x, 
                                                    y: data.y
                                                    }
                                                    : circle
                                                )
                                            );
                                        }
                                        isDragging.current = false;
                                    }}
                                > 
                                    <div ref={nodeRefs} className="node_position">
                                        <div
                                            className={`refinement_circles ${selectedNode ? 'active_node' : ""}`}
                                            style={{backgroundColor: element.color}}
                                        />
                                    </div>
                                </Draggable>
                            );
                        })
                    }

                    <svg className="svg_class">
                        <defs>
                            <marker
                                id="arrow"
                                viewBox='0 0 10 10'
                                refX={8}
                                refY={5}
                                markerWidth={6}
                                markerHeight={6}
                                orient='auto'
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z"/>
                            </marker>
                        </defs>

                        {
                            connections.map((conn, index) => {
                                const source = circles.find(c => c.id === conn.from);
                                const target = circles.find(c => c.id === conn.to);

                                if(!source || !target)
                                {
                                    return null;
                                }

                                const coords = getCoordinatesEdge(source, target);

                                return (
                                    <line 
                                        key={index}
                                        {...coords}
                                        stroke="black"
                                        strokeWidth={2}
                                        markerEnd="url(#arrow)"
                                        onClick = {
                                            () => {
                                                setConnections((prev) => {
                                                    return prev.filter(c => {
                                                        return !(c.from === conn.from && c.to === conn.to);
                                                    });
                                                });
                                            }
                                        }
                                    />
                                )
                            })
                        }
                </svg>
                </div>
                <button 
                className="add_circle_btn" 
                type="button"
                onClick={addCircles}> + </button>
            </div>
            {
                isVisible ? <Program_inspector /> : <Introduction />
            }
        </div>
    )
}


export default Refinement_space