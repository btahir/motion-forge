import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const file='renders/motion-forge-launch.mp4';
function run(cmd,args,encoding){const p=spawnSync(cmd,args,{cwd,encoding,maxBuffer:20*1024*1024});if(p.status)throw Error(String(p.stderr));return p;}
const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],'utf8').stdout);
const stream=probe.streams.find(s=>s.codec_type==='video');
if(stream.width!==1920||stream.height!==1080||stream.r_frame_rate!=='30/1'||stream.nb_frames!=='1350'||Number(probe.format.duration)!==45||Number(stream.start_time)!==0)throw Error('Unexpected video format');
function crop(t,box){return run('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf',`crop=${box},scale=160:140`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1']).stdout;}
const changes=[];
for(const [name,a,b,box]of [['wave',3.5,4.5,'960:840:880:45'],['studio edit',15.5,18,'1408:880:430:160'],['confirmation',29.5,30.5,'960:840:870:50'],['numeric input',35.5,38,'960:840:870:50']]){
 const first=crop(a,box),second=crop(b,box);let sum=0;for(let i=0;i<first.length;i++)sum+=Math.abs(first[i]-second[i]);const mean=sum/first.length;if(mean<.3)throw Error(name+' appears frozen');changes.push({name,from:a,to:b,meanPixelChange:Number(mean.toFixed(3))});
}
const black=run('ffmpeg',['-hide_banner','-i',file,'-vf','blackdetect=d=0.05:pix_th=0.02','-an','-f','null','-'],'utf8').stderr;if(black.includes('black_start:'))throw Error('Black interval detected');
const doc=JSON.parse(readFileSync(cwd+'assets/scout-edited.forge.json'));if(doc.nodes.find(n=>n.id==='shell').fill!=='#97bfa8'||doc.clips[0].tracks[0].keyframes[1].value!==245)throw Error('Recorded edit did not persist');
const report={duration:45,width:1920,height:1080,fps:30,frames:1350,codec:stream.codec_name,bytes:Number(probe.format.size),silent:probe.streams.length===1,zeroStart:true,blackIntervals:0,demonstratedEditsVerified:true,changes};
writeFileSync(cwd+'VERIFICATION.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
