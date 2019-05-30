  const {Storage} = require('@google-cloud/storage');
  const speech = require('@google-cloud/speech');
  var fs = require('fs');
  const path = require('path');
  // Creates a client
  const storage = new Storage();
  const client = new speech.SpeechClient();

  const encoding = 'LINEAR16';
  const sampleRateHertz = 8000;
  const languageCode = 'en-US';
  let speechModel = 'default';
  let useEnhanced = 'false';
  let enableAutomaticPunctuation = "true";
  let errorCount = 0;

  var audioFileList = [];
  var numberOfFiles = 0;
  var batchCount = 0;
  const bucketName = 'demo-audio-storage';
  const bucket = storage.bucket(bucketName);

  let fileList = [];

  const directory = 'transcriptions';

  fs.readdir(directory, (err, files) => {
    if (err) throw err;

    for (const file of files) {
      fs.unlink(path.join(directory, file), err => {
        if (err) throw err;
      });
    }
  });

  console.log("cleared storage - ready to upload");
  uploadFilesFromDirectory();



  function uploadFilesFromDirectory(){
    console.log("listing files to upload: ");
    fs.readdir('./audio', function(err, items) {
        console.log(items);

        for (var i=0; i<items.length; i++) {
          uploadFromDirectoryToBucket('./audio', items[i]);
        }
    });
  }

  async function listFiles(){
  // Lists files in the bucket
  const [files] = await storage.bucket(bucketName).getFiles();

  console.log('Files:');
  let count = 0;
  files.forEach(file => {
    console.log(file.name);
    fileList.push(file.name);
  //  transcribeFromBucket(file.name);
  });
  }

  async function uploadFromDirectoryToBucket(path, filename){
    let uploadWorked = true;
    console.log("uploading: " + path + "/" + filename);
    await storage.bucket(bucketName).upload(path + "/" + filename, {
      // Support for HTTP requests made with `Accept-Encoding: gzip`
      validation: false,
      resumable: true,
    //  gzip: true,
      metadata: {
        // Enable long-lived HTTP caching headers
        // Use only if the contents of the file will never change
        // (If the contents will change, use cacheControl: 'no-cache')
        cacheControl: 'public, max-age=31536000',
      },
    }).catch(e => {
      console.log("skipping file error: upload error");
      uploadWorked = false;
      errorCount++;
    });
    if(uploadWorked){
      console.log('upload of the '+filename+ '.')
      //transcribe after each upload is completed
      transcribeFromBucket(filename);
    }

  }


  async function deleteAllFilesInBucket(){
    console.log("deleting files in bucket");
    const [files] = await storage.bucket(bucketName).getFiles();

    console.log('Files:');
    files.forEach(file => {
      console.log(file.name);
      deleteFileFromBucket(file.name);
    });

  }

  async function deleteFileFromBucket(audioFileName){
    await storage
      .bucket(bucketName)
      .file(audioFileName)
      .delete();

    console.log(`gs://${bucketName}/${audioFileName} deleted.`);
  }

  async function transcribeFromBucket(audioFileName) {
    console.log("Transcribing " + audioFileName);
    let gcsUri = 'gs://demo-audio-storage/' + audioFileName;
    const config = {
        encoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
        audioChannelCount: 2,
        enableSeparateRecognitionPerChannel: true,
        model: speechModel,
        useEnhanced: true
    };

    const audio = {
      uri: gcsUri,
    };

    const request = {
      config: config,
      audio: audio,
    };

    try {
      const [operation] = await client.longRunningRecognize(request);
      const [response] = await operation.promise();

      var json = JSON.stringify(operation.result, null, 4);
      fs.writeFile('transcriptions/' + audioFileName + '_speech.json', json, 'utf8', function(err) {
        if (err) throw err;
        console.log('transcriptions/' + audioFileName + '_speech.json write complete');
      });
      batchCount++;
      deleteFileFromBucket(audioFileName);
    }

    catch(err) {
      console.error(err);
      var json = JSON.stringify(err);
      fs.writeFile('transcriptions/_ERROR-' + audioFileName + '_speech.json', json, 'utf8', function(err) {
        if (err) throw err;
        console.log('JSON write ERROR complete');
        batchCount++;
        deleteFileFromBucket(audioFileName);
      });
    }
    console.log('File processing completed for file: '+ audioFileName);
    console.log("current error count is " + errorCount);
  }
