import { pixelText } from './art.js';
import { TASK_BOARD } from './world.js';

export const BOARD = TASK_BOARD;
const TITLE_CHARS=28,LINE_CHARS=26;
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
  const lines=plain(brief||'').split('\n').map(line=>line.trim()).filter(Boolean);
  if(!lines.length)return {title:'ADD TASK',lines:['WHAT SHOULD THE TEAM DO?','CLICK TO DEFINE THE TASK']};
  if((lines.join('').match(/\?/g)||[]).length>lines.join('').length/4)
    return {title:'CURRENT TASK',lines:['OPEN THE BOARD','TO READ THE FULL BRIEF']};
  const title=excerpt(lines[0],TITLE_CHARS),rest=lines.slice(1);
  if(!rest.length&&lines[0].length>TITLE_CHARS){
    let remainder=lines[0].slice(title.replace(/\.\.\.$/,'').length).trim();
    while(remainder&&rest.length<2){
      const chunk=excerpt(remainder,LINE_CHARS);rest.push(chunk);
      remainder=remainder.slice(chunk.replace(/\.\.\.$/,'').length).trim();
    }
  }
  return {title,lines:rest.slice(0,2).map(line=>excerpt(line,LINE_CHARS))};
}

export function boardStatus(run,connected,hasRoom){
  if(!run)return {text:hasRoom?'READY TO START':'TASK BOARD',accent:'blue'};
  const round=run.round?`R${run.round} - `:'';
  if(!terminal(run)&&!connected)return {text:'RECONNECTING...',accent:'amber'};
  if(run.status==='pausing')return {text:round+'PAUSING...',accent:'blue'};
  if(run.status==='paused')return {text:round+'PAUSED',accent:'blue'};
  if(run.status==='failed')return {text:round+'NEEDS ATTENTION',accent:'coral'};
  if(run.status==='stopped')return {text:round+'STOPPED',accent:'amber'};
  if(run.status==='completed')return {text:round+'COMPLETED',accent:'blue'};
  if(run.pending)return {text:round+'YOUR DECISION',accent:'amber'};
  if([run.participants?.Reviewer,run.participants?.Critic].includes('reviewing'))return {text:round+'REVIEWING',accent:'coral'};
  if(run.participants?.Implementer==='working')return {text:round+'IN PROGRESS',accent:'blue'};
  return {text:round+'WAITING',accent:'blue'};
}

export class TaskBoard {
  constructor(scene){
    this.scene=scene;this.hover=false;this.signature='';
    this.texture=scene.textures.createCanvas('current-task-board',BOARD.width,BOARD.height);
    this.sprite=scene.add.image(BOARD.x,BOARD.y,this.texture.key).setOrigin(0).setDepth(BOARD.y+BOARD.height);
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
    if(room&&!run&&this.scene.session?.configuration.missing().length)this.status={text:'SETUP NEEDED',accent:'blue'};
    const saveState=terminal(run)?this.scene.session?.configuration.saveState:null;
    if(saveState)this.status={text:saveState.label.replace('…','...').toUpperCase(),accent:saveState.error?'coral':'amber'};
    const signature=JSON.stringify([this.copy,this.status,this.scene.mood]);
    if(signature!==this.signature){this.signature=signature;this.draw();}
  }
  draw(){
    if(!this.copy)return;
    const night=this.scene.mood==='night',c=this.texture.getContext();
    c.imageSmoothingEnabled=false;c.clearRect(0,0,BOARD.width,BOARD.height);
    const colors=night?{
      edge:'#44484b',frame:'#947b60',rim:'#b29b7c',grain:'#776550',paper:'#aaa99c',
      inset:'#828779',highlight:'#bdbaaa',ink:'#35434a',muted:'#455257',line:'#91978a',
      blue:'#638a9d',coral:'#af7865',amber:'#9d7846',metal:'#717d82',metalLight:'#9ba4a1',
    }:{
      edge:'#706455',frame:'#caa77c',rim:'#e6cb9e',grain:'#af8b64',paper:'#f0eadb',
      inset:'#d2caba',highlight:'#faf4e6',ink:'#485963',muted:'#657278',line:'#d6d2c3',
      blue:'#7898aa',coral:'#c7836e',amber:'#b18b4c',metal:'#899599',metalLight:'#b5bfbb',
    };
    const p={r:(x,y,w,h,color)=>{c.fillStyle=colors[color]||color;c.fillRect(x,y,w,h);}};
    const w=BOARD.width;
    // Short metal supports and contact shadows make this a room object. They
    // sit behind the light-wood frame; the full sheet never becomes UI chrome.
    p.r(8,58,w-13,2,night?'#20293035':'#66523c20');
    for(const x of [13,w-19]){
      p.r(x,43,3,14,'edge');p.r(x,45,1,12,'metalLight');
      p.r(x-4,57,12,2,'edge');p.r(x-3,57,10,1,'metal');
    }
    p.r(3,3,w-3,49,night?'#20293045':'#59463630');
    p.r(0,0,w-2,50,'edge');p.r(1,1,w-4,47,'frame');
    p.r(1,1,w-5,1,'rim');p.r(1,2,1,45,'rim');
    p.r(w-5,3,2,45,'grain');p.r(2,47,w-5,2,'grain');
    // A recessed warm writing surface and a fine inner shadow.
    p.r(4,4,w-10,42,'inset');p.r(5,5,w-12,40,'paper');
    p.r(6,6,w-14,1,'highlight');
    // Quiet frame joints and grain, not a thick uniform rectangle.
    p.r(3,2,9,1,'grain');p.r(w-22,2,12,1,'grain');
    p.r(2,2,1,1,'edge');p.r(w-4,2,1,1,'edge');
    p.r(2,46,1,1,'edge');p.r(w-4,46,1,1,'edge');
    // Two tiny magnets; the title has its own breathing room beneath them.
    for(const [x,color]of [[11,'blue'],[w-17,'coral']]){
      p.r(x,7,3,2,'inset');p.r(x,6,2,2,color);p.r(x,6,1,1,'highlight');
    }
    pixelText(p,this.copy.title,11,11,'ink');
    this.copy.lines.forEach((line,i)=>{
      pixelText(p,line,11,19+i*7,'muted');
    });
    // An inset divider and five clear pixels under the status baseline.
    p.r(11,33,w-27,1,'line');
    p.r(11,37,2,2,this.status.accent);
    pixelText(p,excerpt(this.status.text,27),17,36,'ink');
    // A projecting tray, two capped markers and a small felt eraser.
    p.r(7,49,w-16,3,'edge');p.r(8,49,w-18,1,'metalLight');
    p.r(9,51,w-20,1,'metal');
    p.r(w-43,47,10,2,'highlight');p.r(w-43,47,3,2,'blue');
    p.r(w-29,47,9,2,'highlight');p.r(w-22,47,2,2,'coral');
    p.r(13,46,8,3,'edge');p.r(14,46,6,2,'metal');
    // Hover catches the frame's top edge instead of adding a UI-style outline.
    if(this.hover)p.r(4,1,w-12,1,'highlight');
    this.texture.refresh();
  }
  inspect(){return {title:this.copy.title,lines:this.copy.lines,status:this.status.text,...BOARD};}
}
