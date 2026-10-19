export async function restoreFile(file, setCircles, setConnections, setInformation)
{
    const fileData = await file.text();
    const restoreObj = await JSON.parse(fileData);

    if(!restoreObj)
    {
        return {};
    }

    setCircles(restoreObj.circles ?? []);
    setConnections(restoreObj.connections ?? []);
    setInformation(restoreObj.information ?? []);
}