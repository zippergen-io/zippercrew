import { pixelText } from './art.js';

export const BOARD = {x:184,y:26,width:148,height:34};
const terminal=run=>!run||['completed','failed','stopped'].includes(run.status);

// A deterministic excerpt, never an invented summary. The full Unicode brief
// remains available in the modern task window; this tiny font is intentionally Latin.
function plain(text){
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[“”`*_#]/g,'').replace(/[‘’]/g,"'").replace(/[–—•]/g,'-')
    .replace(/[^a-zA-Z0-9 .,!?'\-:+/&\n]/g,'?').toUpperCase();
}
function excerpt(text,width){
  if(text.length<=width)return text;
  const part=text.slice(0,width-3),space=part.lastIndexOf(' ');
  return part.slice(0,space>width/2?space:part.length).trimEnd()+'...';
}
export function boardCopy(brief){
  const lines=plain(brief||'').split('\n').map(line=>line.replace(/^\s*[-+]+\s*/,'').trim()).filter(Boolean);
  if(!lines.length)return {title:'YOUR NEXT TASK',lines:['GIVE THE CREW A BRIEF','CLICK TO GET STARTED']};
  if((lines.join('').match(/\?/g)||[]).length>lines.join('').length/4)
    return {title:'CURRENT TASK',lines:['OPEN THE BOARD','TO READ THE FULL BRIEF']};
  const title=excerpt(lines[0],33),rest=lines.slice(1);
  if(!rest.length&&lines[0].length>33){
    let remainder=lines[0].slice(title.replace(/\.\.\.$/,'').length).trim();
    while(remainder&&rest.length<2){
      const chunk=excerpt(remainder,31);rest.push(chunk);
      remainder=remainder.slice(chunk.replace(/\.\.\.$/,'').length).trim();
    }
  }
  return {title,lines:rest.slice(0,2).map(line=>excerpt(line,31))};
}

export function boardStatus(run,connected,hasRoom){
  if(!run)return {text:hasRoom?'READY TO START':'TASK BOARD',accent:'blue'};
  const round=run.round?`R${run.round} - `:'';
  if(!terminal(run)&&!connected)return {text:'RECONNECTING...',accent:'amber'};
  if(run.status==='failed')return {text:round+'NEEDS ATTENTION',accent:'coral'};
  if(run.status==='stopped')return {text:round+'STOPPED',accent:'amber'};
  if(run.status==='completed')return {text:round+'COMPLETED',accent:'blue'};
  if(run.pending)return {text:round+'YOUR DECISION',accent:'amber'};
  if(run.participants?.Reviewer==='reviewing')return {text:round+'REVIEWING',accent:'coral'};
  if(run.participants?.Implementer==='working')return {text:round+'IN PROGRESS',accent:'blue'};
  return {text:round+'WAITING',accent:'blue'};
}

export class TaskBoard {
  constructor(scene){
    this.scene=scene;this.hover=false;this.signature='';
    this.texture=scene.textures.createCanvas('current-task-board',BOARD.width,BOARD.height);
    this.sprite=scene.add.image(BOARD.x,BOARD.y,this.texture.key).setOrigin(0).setDepth(58);
    this.sprite.contextOwner='task-board';
    this.sprite.setInteractive({useHandCursor:true});
    this.sprite.on('pointerover',()=>{this.hover=true;this.draw();});
    this.sprite.on('pointerout',()=>{this.hover=false;this.draw();});
    this.sprite.on('pointerup',(pointer,_x,_y,event)=>{
      if(document.getElementById('detail-dialog').open||pointer.event?.target!==scene.game.canvas||pointer.getDistance()>6)return;
      event.stopPropagation();scene.session?.openCurrent();
    });
    this.update(null,null,false);
  }
  update(room,run,connected){
    this.copy=boardCopy(room?.brief);
    this.status=boardStatus(run,connected,!!room);
    const signature=JSON.stringify([this.copy,this.status,this.scene.mood]);
    if(signature!==this.signature){this.signature=signature;this.draw();}
  }
  draw(){
    if(!this.copy)return;
    const night=this.scene.mood==='night',c=this.texture.getContext();
    c.imageSmoothingEnabled=false;c.clearRect(0,0,BOARD.width,BOARD.height);
    const colors=night?{edge:'#544d49',frame:'#94775d',paper:'#6b747d',ink:'#f0e6d3',muted:'#d0d6d8',line:'#858b8d',blue:'#a9c4d0',coral:'#db9b89',amber:'#e2b776'}:
      {edge:'#6e6258',frame:'#b99772',paper:'#f3eee4',ink:'#4d5c67',muted:'#6c767b',line:'#ddd6c8',blue:'#7898aa',coral:'#c67f6e',amber:'#c39a51'};
    const p={r:(x,y,w,h,color)=>{c.fillStyle=colors[color]||color;c.fillRect(x,y,w,h);}};
    p.r(1,1,146,32,'edge');p.r(0,0,147,32,'frame');p.r(1,1,145,30,'edge');
    p.r(2,2,143,29,'paper');p.r(3,2,141,1,night?'#889093':'#fffaf0');
    p.r(4,23,137,1,'line');p.r(4,31,137,2,'frame');p.r(125,31,8,1,'blue');p.r(136,31,5,1,'coral');
    pixelText(p,this.copy.title,6,3,'ink');
    this.copy.lines.forEach((line,i)=>{p.r(6,12+i*7,2,1,'coral');pixelText(p,line,11,10+i*7,'muted');});
    p.r(6,25,2,2,this.status.accent);pixelText(p,excerpt(this.status.text,31),12,24,'ink');
    if(this.hover){p.r(0,0,147,1,'blue');p.r(0,0,1,32,'blue');p.r(146,0,1,32,'blue');}
    this.texture.refresh();
  }
  inspect(){return {title:this.copy.title,lines:this.copy.lines,status:this.status.text,...BOARD};}
}
