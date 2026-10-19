import { useState } from 'react';
import Refinement_space from './refinement_space.jsx';
import { restoreFile } from './utils.js';
import './App.css';

function App() {
  const [circles, setCircles] = useState([]);
  const [connections, setConnections] = useState([]);
  const [information, setInformation] = useState(new Map()); 
  const [saveFiles, setSaveFiles] = useState([]);
  const [uploadFile, setUploadFile] = useState([]);

   async function onSave()
    {
      const saveObj = {
          circles: circles, 
          connections: connections,
          information: Array.from(information.entries())
      }
      //localStorage.setItem("saveObj", JSON.stringify(saveObj));
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
      const writable = await filePicker.createWritable();
      await writable.write(JSON.stringify(saveObj, null, 2));
      await writable.close();

      setSaveFiles((prevFiles) => [...prevFiles, {name: filePicker.name, handle: filePicker}]);
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
    
      await restoreFile(file, setCircles, setConnections, setInformation);
      const fileExists = saveFiles.some(f => f.name === fileHandle.name);

      if(!fileExists)
      {
        setSaveFiles((prevFiles) => [...prevFiles, {name: fileHandle.name, handle: fileHandle}]); 
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
      />
    </div>
  )
}

export default App
