const { DBFFile } = require('dbffile');
const fs = require('fs');
const fastCsv = require('fast-csv');

async function convert() {
    const dbfPath = "C:\\Users\\Yadir\\Downloads\\NOMENCLATURA_DOMICILIARIA\\U_NOMENCLATURA_DOMICILIARIA.dbf";
    const outPath = "C:\\proyectos\\WorkScripts\\1_Flujo_Multiagent\\workspace\\ecommerce-mascotas-colombia\\data\\nomenclatura_igac_nacional.csv";
    
    console.log("Abriendo DBF...");
    const dbf = await DBFFile.open(dbfPath, {encoding: 'utf-8'});
    console.log(`Total registros: ${dbf.recordCount}`);
    
    // Asegurar carpeta data/
    const outDir = require('path').dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const ws = fs.createWriteStream(outPath);
    const csvStream = fastCsv.format({ headers: true });
    csvStream.pipe(ws);
    
    let offset = 0;
    const chunkSize = 50000;
    while (offset < dbf.recordCount) {
        const records = await dbf.readRecords(chunkSize);
        for (const record of records) {
            csvStream.write(record);
        }
        offset += records.length;
        process.stdout.write(`\rProcesados: ${offset}`);
    }
    csvStream.end();
    console.log("\nConversion terminada.");
}

convert().catch(console.error);
