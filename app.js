const express = require("express");
const app = express();
const path = require("path");
const { exec, spawn } = require("child_process");
const fs = require("fs");

app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req,res)=>{
    res.render("camera");
});

let latestFrame = null;

//ストリーミング
app.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'close'
    });
    // libcamera-vidを実行
    const cam = spawn('libcamera-vid', [
     "--nopreview",
     "--codec", "mjpeg",
     "--width", "640",
     "--height", "480", 
     "--framerate", "24",
     "-t", "0",
     "--output", "-"
    ]);

    let buffer = Buffer.alloc(0);
    cam.stdout.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        // JPEGフレームの先頭と末尾を探す
        let start = buffer.indexOf(Buffer.from([0xFF, 0xD8])); // SOI
        let end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));   // EOI
        while (start !== -1 && end !== -1 && end > start) {
            const frame = buffer.slice(start, end + 2);
            latestFrame = frame;
            //ライブ配信
            res.write(`--frame\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');
            if(recordingProcess){
                recordingProcess.stdin.write(frame);
            }
            buffer = buffer.slice(end + 2);
            start = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
            end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
        }
    });
    cam.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
    req.on('close', () => {
        cam.kill();
    });
});

app.get("/photo", (req,res)=>{
    if(!latestFrame) return res.status(500).send("フレーム未取得");
    const filename = `photo_${Date.now()}.jpg`;
    const filePath = path.join(__dirname, "public", "photos", filename);
    //保存
    fs.writeFileSync(filePath, latestFrame);
    res.json({ url: `/photos/${filename}` });
});

let recordingProcess = null;

// 動画録画開始
app.get("/video/start", (req, res) => {
  if (recordingProcess) return res.json({ result: false, message: "既に録画中です" });
  const filename = `video_${Date.now()}.mp4`;
  const filePath = path.join(__dirname, "public", "videos", filename);

  recordingProcess = spawn("ffmpeg", [
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-i", "-",
    "-r", "24",
    "-c:v", "libx264", //copyだと失敗するのでエンコード
    filePath
  ]);
  recordingProcess.outputFile = `videos/${filename}`;
  res.json({result: true, message:`録画を開始しました`, file: recordingProcess.outputFile});
});

// 動画録画停止
app.get("/video/stop", (req, res) => {
  if (!recordingProcess) return res.json({ result: false, message:"録画中ではありません"});
  
  const proc = recordingProcess;
  recordingProcess.stdin.end();
  recordingProcess = null;

  proc.on("close", (code)=>{
    console.log("ffmpeg closed with code", code);
      //保存するか確認
    res.json({result: true, message: "録画完了", file: proc.outputFile});
  });
});

//一時保管リソースの削除
app.get("/dispose/:dir/:file", async(req,res)=>{
    const { dir, file } = req.params;
    if(!file || !dir){ 
        return res.json({ result:false, message: "削除対象は省略できません" });
    }

    //一時ファイルの保存ディレクトリを限定
    const photoDir = path.join(__dirname, "public", "photos");
    const videoDir = path.join(__dirname, "public", "videos");

    if(!dir.startsWith("photos") && !dir.startsWith("videos")){
        return res.json({ result:false, message: "不正なパスです" });
    }

    //正規化して安全な絶対パスを作成
    const filePath = path.join(__dirname, "public", dir, file);
    const normalizedPath = path.normalize(filePath);

    //絶対パスが photosかvideos 内かチェック
    if(!normalizedPath.startsWith(photoDir) && !normalizedPath.startsWith(videoDir)){
        return res.json({ result: false, message: "不正内アクセスです" });
    }

    //一時ファイルの削除
    try{
        await fs.unlink(normalizedPath);
        return res.json({ result: true, message:"削除しました" });
    }catch(err){
        if(err.code === "ENOENT"){
            return res.json({result: false, message: "ファイルが存在しません"});
        }
        return res.json({ result: false, message: err.toString() });
    }
});


app.listen(3000, ()=>{
    console.log("ポート3000で待受け中");
});