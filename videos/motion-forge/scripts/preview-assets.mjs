import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
function ff(args){const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{cwd,stdio:'inherit'});if(p.status)throw Error('ffmpeg failed');}
const input='renders/motion-forge-launch.mp4';
const ranges=[[3,6],[16,19],[29.5,32.5],[36,39],[42,45]];
const cuts=ranges.map(([a,b],i)=>`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}]`).join(';');
const filter=cuts+';'+ranges.map((_,i)=>`[v${i}]`).join('')+'concat=n=5:v=1:a=0,fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3';
ff(['-i',input,'-filter_complex',filter,'-loop','0','renders/motion-forge-preview.gif']);
ff(['-ss','5','-i',input,'-frames:v','1','-q:v','2','renders/motion-forge-poster.jpg']);
ff(['-i',input,'-vf',"select='eq(n,150)+eq(n,540)+eq(n,690)+eq(n,915)+eq(n,1140)+eq(n,1320)',scale=640:360,tile=3x2",'-frames:v','1','-q:v','2','renders/contact-sheet.jpg']);
console.log('README preview, poster and rendered contact sheet created.');
