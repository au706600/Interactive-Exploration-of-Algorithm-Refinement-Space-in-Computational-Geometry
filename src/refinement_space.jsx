import { useState, useRef, useEffect } from 'react';
import './refinement_space.css';
import Draggable from 'react-draggable';
import { restoreFile } from './utils.js';
import Program_inspector from './program_inspector.jsx';
import Introduction from './Introduction.jsx';
import { useSnapshotAutosave } from './utils.js';
import { get, set, del } from 'idb-keyval';

function Refinement_space({circles, setCircles, connections, setConnections, information, setInformation, saveFiles, setSaveFiles, currentFileId, setCurrentFileId})
{
    // https://www.codemzy.com/blog/autosave-reactjs-with-setinterval
    const [activeSourceNodeId, setActiveSourceNodeId] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const circleRef = useRef(new Map());
    const isDragging = useRef(false);
    const refinementRef = useRef(null);
    const [activeLiElement, setActiveLiElement] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadedSpaceKey, setLoadedSpaceKey] = useState(null);

    const spaceKey = `space_${currentFileId ?? "default"}` 
    //const width = 600;
    //const padding = 30;
    //const spacing = 40; 

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

    function handleClickLiElement(liId)
    {
        if(activeLiElement === liId)
        {
            setActiveLiElement(null);
        }
        else
        {
            setActiveLiElement(liId);
        }
    }

    async function handleResetPage()
    { 
        await del("space_default");

        if(currentFileId)
        {
            await del(`space_${currentFileId ?? "default"}`);
        }

        await del("projectfiles");

        setCircles([]);
        setConnections([]);
        setInformation(new Map());
        setActiveSourceNodeId(null);
        setIsVisible(false);
        setActiveLiElement(null);
        setCurrentFileId(null);
        setSaveFiles([]);
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
            /*
            const maxCols = Math.floor((width - padding * 2) / spacing);
            const col = element.length % maxCols;
            const row = Math.floor(element.length / maxCols);
            let nextx = padding + col * spacing;
            let nexty = padding + row * spacing;
            */

            const rect = refinementRef.current.getBoundingClientRect();
            const nextx = rect.width / 2;
            const nexty = rect.height / 2;

            const circleObj = {
                id: crypto.randomUUID(), 
                x: nextx, 
                y: nexty,
                color: randomColor()
            }

            return [...element, circleObj];
        });
    }


    const removeCircles = (e, circleId) => 
    {
        e.preventDefault();
        setCircles((prev) => {
            return prev.filter(c => {
                return !(c.id === circleId);
            });
        });

        setConnections((prev) => {
            return prev.filter(c => {
                return !(c.from === circleId && c.to === circleId);
            });
        })

    }

    function handleRightClick(e, circleId)
    {
        e.preventDefault();
        removeCircles(e, circleId);
    }

    async function onRestore(specificFileId = null)
    {
        //const restoreObj = JSON.parse(localStorage.getItem("saveObj"));

        if(specificFileId)
        {
            setCurrentFileId(specificFileId);
            return;
        }
        
        let file_Id = specificFileId;

        if(!file_Id)
        {
            const opts = {
                suggestedName: "refinement",
                types: [
                {
                    description: "Save geometric refinement problems",
                    accept: { "application/json": [".geo"] } 
                }
                ]
            } 
            const [handle] = await window.showOpenFilePicker(opts);
            fileHandle = handle;
        }
        else
        {
            console.log("Restoring", file_Id);
            const saved = await get(`space_${file_Id}`);
            console.log(saved);
            console.log(saved?.circles);
            console.log(saved?.connections);
            if(saved)
            {
                setCircles(saved.circles || []);
                setConnections(saved.connections || []);
                setInformation(saved.information instanceof Map 
                    ? saved.information 
                    : new Map(saved.information || []));
                setCurrentFileId(file_Id);
                return;
            }
        }

        const file = await fileHandle.getFile();

        const fileId = await restoreFile(file, setCircles, setConnections, setInformation);
        
        if(fileId)
        {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await set(`space_${fileId}`, {
                circles: parsed.circles ?? [], 
                connections: parsed.connections ?? [], 
                information: parsed.information ?? [], 
            });
            setCurrentFileId(fileId);
        }
        
        const fileExists = saveFiles.some(f => f.id === fileId);
        if(!fileExists)
        {
            //setSaveFiles((prev) => [...prev, {id: crypto.randomUUID(), name: fileHandle.name, handle: fileHandle}]);
            setSaveFiles((prev) => [...prev, {id: fileId, name: fileHandle.name, handle: fileHandle}])
        }
    }

    useEffect(() => {

        let isMounted = true;

        async function loadSpace()
        {
            setIsLoaded(false);
            setLoadedSpaceKey(null);

            let saved = await get(spaceKey);

            if(isMounted)
            {
                if(saved)
                {
                    setCircles(saved.circles || []);
                    setConnections(saved.connections || []);
                    setInformation(saved.information instanceof Map 
                        ? saved.information 
                        : new Map(saved.information || []));
                }
                setIsLoaded(true);
                setLoadedSpaceKey(spaceKey);
            }
        }

        loadSpace();

        return () => {
            isMounted = false;
        }
    }, [spaceKey]);

    const autosave = isLoaded && loadedSpaceKey === spaceKey;

    useEffect(() => {
        
        if(!autosave)
        {
            return;
        }

        const timeOutId = setTimeout(() => {
            set(spaceKey, {
                circles, 
                connections,
                information, 
            });
        }, 100);

        return () => clearTimeout(timeOutId);
    }, [circles, connections, information, spaceKey, autosave]);

    useSnapshotAutosave( spaceKey, { circles, connections, information }, autosave );

    const uniqueFileNames = saveFiles.filter((value, index, self) => {
        return self.findIndex(f => f.name === value.name) === index;
    });

    return(
        <div className="container_computation">
            <div className="navbar" onClick={handleResetPage}>
                <ul>
                    {/*
                    <li><a href="#">Program1</a></li>
                    <li><a href="#">Program2</a></li>
                    <li><a href="#">Program3</a></li>
                    <li><a href="#">Program4</a></li>
                    */}
                    {
                        uniqueFileNames.map((fileName) => {
                            const selectedLiElement = currentFileId === fileName.id;

                            return (
                            <div key={fileName.id}>
                                <li onClick={(e) => {
                                    e.stopPropagation();
                                    handleClickLiElement(fileName.id);
                                    onRestore(fileName.id);
                                }}
                                style={{cursor: 'pointer'}}
                                className={`activeLiElement ${selectedLiElement ? 'liActive' : ""} `}
                                >
                                    {fileName.name}
                                </li>
                            </div>
                            
                            );
                        })
                    }
                </ul>
            </div>
            <div className="refinement_container">
                <div ref={refinementRef} className="refinement_window">
                    {
                        circles.map((element) => {
                            const nodeRefs = circleRefs(`${currentFileId ?? "default"}_${element.id}`);

                            const selectedNode = activeSourceNodeId === element.id;
                            isDragging.current = false;
                            
                            return (
                                <Draggable
                                    key={`${currentFileId ?? "default"}_${element.id}`}
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
                                    <div ref={nodeRefs} className="node_position" onContextMenu={(e) => handleRightClick(e, element.id)}>
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
                isVisible && activeSourceNodeId !== null ? <Program_inspector key={`${activeSourceNodeId}_${currentFileId}`} inspector_id={activeSourceNodeId} file_id={currentFileId} /> : <Introduction />
            }
        </div>
    )
}

export default Refinement_space