import { useEffect, useState } from 'react';
import Refinement_space from './refinement_space.jsx';
import { restoreFile } from './utils.js';
import './App.css';
import { get, set} from 'idb-keyval';

function App() {
  const [circles, setCircles] = useState([]);
  const [connections, setConnections] = useState([]);
  const [information, setInformation] = useState(new Map()); 
  const [saveFiles, setSaveFiles] = useState([]);
  const [uploadFile, setUploadFile] = useState([]);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadSaveFiles()
    {
      const files = await get("projectfiles");
      
      if(files)
      {
        setSaveFiles(files);
      }
      setIsLoaded(true);
    }

    loadSaveFiles();
  }, []);

  useEffect(() => {
    if(isLoaded)
    {
      set("projectfiles", saveFiles);
    }
  }, [saveFiles, isLoaded]);

   async function onSave()
    {
      const fileId = currentFileId || crypto.randomUUID();
      const sourceFileId = currentFileId ?? "default";
      const updatedInfo = new Map(information);
      const opts = {
        suggestedName: "refinement",
        types: [
          {
            description: "Save geometric refinement problems",
            accept: { "application/json": [".geo"] } 
          }
        ]
      } 
      const filePicker = await window.showSaveFilePicker(opts);

      for(const circle of circles)
      {
        const key = `inspector_${circle.id}_${sourceFileId}`;
        let saved = await get(key);

        if(saved)
        {
          updatedInfo.set(circle.id, saved);

          if(!currentFileId)
          {
            await set(`inspector_${circle.id}_${fileId}`, saved);
          }
        }
      }

      setInformation(updatedInfo);

      const saveObj = {
          fileId: fileId,
          circles: circles, 
          connections: connections,
          information: Array.from(updatedInfo.entries())
      }
      //localStorage.setItem("saveObj", JSON.stringify(saveObj));

      const writable = await filePicker.createWritable();
      await writable.write(JSON.stringify(saveObj, null, 2));
      await writable.close();

      await set(`space_${fileId}`, {
        circles, 
        connections, 
        information: Array.from(updatedInfo.entries())
      });

      setCurrentFileId(fileId);

      //setSaveFiles((prevFiles) => [...prevFiles, {name: filePicker.name, handle: filePicker}]);
      setSaveFiles((prevFiles) => [...prevFiles, {id: fileId, name: filePicker.name, handle: filePicker}]);
    }

    async function onUpload()
    {
      if(!uploadFile)
      {
        return;
      }

      const opts = 
      {
          suggestedName: "refinement",
          types: [
            {
                description: "Save geometric refinement problems",
                accept: { "application/json": [".geo"] } 
            }
          ]
      }

      const [fileHandle] = await window.showOpenFilePicker(opts);
      const file = await fileHandle.getFile();
    
      const fileId = await restoreFile(file, setCircles, setConnections, setInformation);

      if(fileId)
      {
        const text = await file.text();
        const parse = JSON.parse(text);

        for(const [nodeId, nodeData] of (parse.information ?? []))
        {
          await set(`inspector_${nodeId}_${fileId}`, nodeData);
        }

        await set(`space_${fileId}`, {
          circles: parse.circles ?? [], 
          connections: parse.connections ?? [], 
          information: parse.information ?? []
        });

        setCurrentFileId(fileId);
      }

      //await restoreFile(file, setCircles, setConnections, setInformation);
      const fileExists = saveFiles.some(f => f.id === fileId);

      if(!fileExists)
      {
        //setSaveFiles((prevFiles) => [...prevFiles, {name: fileHandle.name, handle: fileHandle}]);
        setSaveFiles((prevFiles) => [...prevFiles, {id: fileId, name: fileHandle.name, handle: fileHandle}]); 
      }
    }

  return (
    <div>
      <ul className="li-items"> 
        <li><button onClick={onSave} style={{cursor: 'pointer'}}> Save Project </button></li>
        <li><button onClick={onUpload} style={{cursor: 'pointer'}}> Upload Project </button></li>
      </ul>
      <Refinement_space 
        circles={circles}
        setCircles={setCircles}
        connections={connections}
        setConnections={setConnections}
        information={information}
        setInformation={setInformation}
        saveFiles={saveFiles}
        setSaveFiles={setSaveFiles}
        currentFileId={currentFileId}
        setCurrentFileId={setCurrentFileId}
      />
    </div>
  )
}

export default App
