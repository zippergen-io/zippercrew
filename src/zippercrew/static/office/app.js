import { WORLD, PEOPLE } from './world.js';
import { createArt, labelTexture, CHARACTER_ANCHORS } from './art.js';
import { createNavigation } from './navigation.js';
import { OfficeSession } from './session.js';
import { PALETTES } from './palettes.js';
import { Seating } from './seating.js';
import { NightLighting } from './lighting.js';
import { AvatarMotion, DIRECTIONS } from './avatar-motion.js';
import { OfficeInterface } from './interface.js';

const $=id=>document.getElementById(id);
// Odd-width bitmap labels and markers need integer origins as well as positions.
const pixelCenter=sprite=>sprite.setOrigin(Math.floor(sprite.width/2)/sprite.width,Math.floor(sprite.height/2)/sprite.height);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');

class Studio extends Phaser.Scene {
  constructor(){super('Studio');this.people=new Map();this.paused=reducedMotion.matches;this.elapsed=0;this.selected=null;this.hovered=null;this.conversation=null;this.ready=false;this.mood=new URLSearchParams(location.search).get('mood')==='night'?'night':'day';this.themedImages=[];this.zoneLabels=[];}
  themedImage(x,y,key){const sprite=this.add.image(x,y,this.lighting.textureKey(this.mood,key,x,y));this.themedImages.push({sprite,key,x,y});return sprite;}
  create(){
    this.cameras.main.setRoundPixels(true);
    for(const mood of ['day','night'])createArt(this,mood);
    this.lighting=new NightLighting(this);
    this.nav=createNavigation();this.seating=new Seating(this);
    this.themedImage(0,0,'architecture').setOrigin(0).setDepth(-3);
    // A true Phaser tilemap. Tile indices provide controlled wood variation.
    const {tile,floor}=WORLD;
    const data=Array.from({length:WORLD.height/tile},(_,y)=>Array.from({length:WORLD.width/tile},(_,x)=>y*tile>=floor.y&&y*tile<floor.y+floor.height&&x*tile>=floor.x&&x*tile<floor.x+floor.width?((x+(y%2)*2)%4):-1));
    this.map=this.make.tilemap({data,tileWidth:tile,tileHeight:tile});
    this.floorTiles=this.map.addTilesetImage('floor-tiles',`${this.mood}:floor-tiles`,tile,tile,0,0);
    this.map.createLayer(0,this.floorTiles,0,0).setDepth(-2);
    for(const z of WORLD.zones){this.themedImage(z.x,z.y,`rug-${z.id}`).setOrigin(0).setDepth(-1);const sprite=this.add.image(z.x+8,z.y-15,labelTexture(this,z.label,{color:'zone'})).setOrigin(0).setDepth(1);this.zoneLabels.push({sprite,text:z.label});}
    this.themedImage(0,0,'lighting').setOrigin(0).setDepth(-.5);
    // Render shadows and furniture in the same coordinate system. Floor-bound
    // sorting lets characters pass both in front of and behind each object.
    for(const f of WORLD.furniture){
      const key=f.type==='chair'?`chair-${f.variant}-back`:this.textures.exists(`${this.mood}:${f.type}-${f.variant}`)?`${f.type}-${f.variant}`:f.type;
      const sprite=this.themedImage(f.x,f.y,key).setOrigin(0).setDepth(f.y+(f.footprint?.[1]??0)+(f.footprint?.[3]??30));
      if(f.owner){
        sprite.contextOwner=f.owner;sprite.setInteractive({useHandCursor:true});
        sprite.on('pointerup',(pointer,_x,_y,event)=>{if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return;event.stopPropagation();this.ui.showTask(f.owner);});
      }
      if(f.seat){
        const chair=this.seating.chairs.get(f.id),feet=this.seating.points(chair).feet;
        // Background/backrest behind the person; lip/armrests just in front.
        chair.back=sprite.setDepth(feet.y-1);
        chair.front=this.themedImage(f.x,f.y,f.type==='chair'?`chair-${f.variant}-front`:'armchair-front').setOrigin(0).setDepth(feet.y+1);
      }
    }
    this.destination=pixelCenter(this.themedImage(0,0,'destination')).setDepth(2).setVisible(false);
    this.selection=pixelCenter(this.themedImage(0,0,'selection')).setDepth(3).setVisible(false);
    for(const data of PEOPLE){
      const p={...data,route:[],motion:new AvatarMotion(data.direction,this.people.size),bubble:null,bubbleUntil:0,onArrival:null,seated:null,transition:null,seatApproach:null};
      p.sprite=this.add.sprite(p.x,p.y,`${this.mood}:person-${p.id}`,DIRECTIONS[p.direction]*4).setOrigin(CHARACTER_ANCHORS.feet.x/32,CHARACTER_ANCHORS.feet.y/36).setDepth(p.y).setInteractive(new Phaser.Geom.Rectangle(5,2,23,34),Phaser.Geom.Rectangle.Contains);
      p.sprite.on('pointerover',()=>{this.hovered=p.id;this.game.canvas.style.cursor='pointer';});
      p.sprite.on('pointerout',()=>{this.hovered=null;this.game.canvas.style.cursor='crosshair';});
      p.sprite.on('pointerup',(pointer,_x,_y,event)=>{if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return;event.stopPropagation();this.select(p.id);});
      p.nameTag=pixelCenter(this.add.image(p.x,p.y+9,this.nameTexture(p))).setDepth(700).setVisible(p.id==='human');
      this.people.set(p.id,p);
    }
    this.seating.sit(this.people.get('worker'),this.seating.chairs.get('chair-1'),true);
    this.talkDots=pixelCenter(this.add.image(0,0,labelTexture(this,'...',{background:'bubble',color:'bubbleInk',bubble:true}))).setDepth(810).setVisible(false);
    this.seating.sit(this.people.get('reviewer'),this.seating.chairs.get('chair-2'),true);
    this.input.on('pointerup',pointer=>{
      if($('detail-dialog').open||pointer.event?.target!==this.game.canvas||pointer.getDistance()>6)return; // A touch pan is not a walking command.
      // Sprite selection and floor movement are mutually exclusive.
      if(this.input.hitTestPointer(pointer).some(o=>o.contextOwner||[...this.people.values()].some(p=>p.sprite===o)))return;
      this.ui.dismiss(false);this.ui.explored();
      const chair=[...this.seating.chairs.values()].find(f=>pointer.worldX>=f.x&&pointer.worldX<=f.x+(f.type==='chair'?24:30)&&pointer.worldY>=f.y&&pointer.worldY<=f.y+(f.type==='chair'?27:34));
      if(chair){if(!this.requestSit('human',chair.id,'Taking a seat'))this.say('human','THAT SEAT IS TAKEN.',2.5);$('game').focus({preventScroll:true});return;}
      if(pointer.worldX<38||pointer.worldX>523||pointer.worldY<69||pointer.worldY>316)return;
      const moved=this.moveTo('human',{x:pointer.worldX,y:pointer.worldY},{status:'Exploring the studio',onArrival:()=>{this.people.get('human').status='Taking it all in';this.greetNearby();}});
      if(moved){const p=this.people.get('human'),last=p.route.at(-1)||p.goal;this.destination.setPosition(Math.round(last.x),Math.round(last.y)).setVisible(true);}
      $('game').focus({preventScroll:true});
    });
    this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,ESC',false);
    this.input.keyboard.on('keydown',event=>{if(document.activeElement===$('game')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key))event.preventDefault();});
    this.game.canvas.style.touchAction='pan-x pan-y';
    this.buildUI();this.setMood(this.mood);this.resize(true);this.ready=true;window.studio=this;
    new ResizeObserver(()=>this.resize()).observe($('scene-scroll'));
    window.addEventListener('resize',()=>this.resize());
    reducedMotion.addEventListener('change',event=>{this.paused=event.matches;this.updatePauseUI();});
    this.updatePauseUI();
    this.session=new OfficeSession(this);this.session.boot();
  }
  resize(fit=false){
    const view=$('scene-scroll'),dpr=window.devicePixelRatio||1;
    this.game.canvas.getContext('2d').imageSmoothingEnabled=false;
    // Every source pixel occupies an integer number of physical display pixels,
    // including browser zoom and Retina displays. Small screens can scroll.
    const padding=getComputedStyle(view),availableWidth=view.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight),availableHeight=view.clientHeight-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom);
    // Keep avatars readable on phones; pan the native-size office instead of
    // fitting the entire world into a tiny Retina thumbnail.
    const fitted=Math.max(Math.ceil(dpr),Math.floor(Math.min(availableWidth*dpr/WORLD.width,availableHeight*dpr/WORLD.height)));
    if(fit||!this.manualZoom)this.physicalScale=fitted;
    const maxScale=Math.max(1,Math.floor(8*dpr));
    this.physicalScale=Math.max(1,Math.min(maxScale,this.physicalScale));
    const cssScale=this.physicalScale/dpr,w=WORLD.width*cssScale,h=WORLD.height*cssScale;
    this.game.canvas.style.width=`${w}px`;this.game.canvas.style.height=`${h}px`;
    $('game').style.width=`${w}px`;$('game').style.height=`${h}px`;
    view.style.justifyItems=w>availableWidth?'start':'center';view.style.alignItems=h>availableHeight?'start':'center';
    this.scale.updateBounds();$('zoom-out').disabled=this.physicalScale<=1;$('zoom-in').disabled=this.physicalScale>=maxScale;
    $('fit').textContent=this.manualZoom?`${Number(cssScale.toFixed(2))}×`:'Fit';
    this.ui?.reposition();
  }
  nameTexture(p){return labelTexture(this,p.name,{background:p.id==='human'?'#f3edd7':null,color:p.id==='human'?'bubbleInk':'ink',accent:p.id});}
  setMood(mood){
    if(!PALETTES[mood])return;
    this.mood=mood;document.documentElement.dataset.mood=mood;
    for(const {sprite,key,x,y} of this.themedImages)sprite.setTexture(this.lighting.textureKey(mood,key,x,y));
    this.floorTiles.setImage(this.textures.get(`${mood}:floor-tiles`));
    for(const {sprite,text} of this.zoneLabels)sprite.setTexture(labelTexture(this,text,{color:'zone'}));
    for(const p of this.people.values()){
      p.sprite.setTexture(this.lighting.characterKey(p),p.sprite.frame.name);
      p.nameTag.setTexture(this.nameTexture(p));
      if(p.bubble)p.bubble.setTexture(labelTexture(this,p.bubbleText,{background:'bubble',color:'bubbleInk',bubble:true}));
    }
    this.talkDots.setTexture(labelTexture(this,'...',{background:'bubble',color:'bubbleInk',bubble:true}));
    document.querySelectorAll('[data-mood-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.moodChoice===mood)));
    document.querySelectorAll('canvas[data-portrait]').forEach(canvas=>this.portrait(canvas,canvas.dataset.portrait));
    document.querySelectorAll('[data-person]').forEach(button=>button.style.setProperty('--role-accent',PALETTES[mood][button.dataset.person]));
    if(this.selected){this.updatePerson();this.portrait($('person-portrait'),this.selected);}
    if(this.ui?.taskOwner)$('task-owner').style.setProperty('--role-accent',PALETTES[mood][this.ui.taskOwner]);
    document.querySelector('meta[name="theme-color"]').content=mood==='night'?'#262e39':'#f8f5ef';
    const url=new URL(location.href);url.searchParams.set('mood',mood);history.replaceState(null,'',url);
  }
  portrait(canvas,id){const texture=this.textures.get(`${this.mood}:person-${id}`);const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(texture.getSourceImage(),0,0,32,36,0,0,32,36);}
  buildUI(){
    for(const person of PEOPLE){
      const portrait=document.createElement('canvas');portrait.width=32;portrait.height=36;portrait.dataset.portrait=person.id;portrait.title=`${person.name} · ${person.role}`;this.portrait(portrait,person.id);
      const button=document.createElement('button');button.dataset.person=person.id;button.setAttribute('aria-label',`${person.name}, ${person.role}`);button.setAttribute('aria-pressed','false');
      const canvas=portrait.cloneNode();this.portrait(canvas,person.id);button.append(canvas);
      const copy=document.createElement('span');const name=document.createElement('span');name.className='crew-name';name.textContent=person.name;const role=document.createElement('span');role.className='crew-role';role.textContent=person.role;copy.append(name,role);button.append(copy);button.addEventListener('click',()=>this.select(this.selected===person.id?null:person.id));$('crew').append(button);
    }
    $('pause').onclick=()=>{this.paused=!this.paused;this.updatePauseUI();};
    $('zoom-in').onclick=()=>{this.manualZoom=true;this.physicalScale++;this.resize();};
    $('zoom-out').onclick=()=>{this.manualZoom=true;this.physicalScale--;this.resize();};
    $('fit').onclick=()=>{this.manualZoom=false;this.resize(true);};
    $('close-person').onclick=()=>this.select(null);
    document.querySelectorAll('[data-mood-choice]').forEach(button=>button.onclick=()=>this.setMood(button.dataset.moodChoice));
    $('sit').onclick=()=>{const p=this.people.get('human');if(p.seated){this.seating.cancelApproach(p);this.seating.stand(p);p.status='Taking it all in';}else if(!this.requestSit('human',p.chairId,'Settling in at your desk'))this.say('human','THAT SEAT IS TAKEN.',2.5);this.updateStatus();this.ui.closePopovers();$('game').focus({preventScroll:true});};
    this.ui=new OfficeInterface(this);this.updateSeatUI();
  }
  requestSit(id,chairId,status){return this.seating.request(id,chairId,status);}
  updateSeatUI(){const p=this.people.get('human');if(!p||!$('sit'))return;$('sit').textContent=p.seated?'Stand up':p.seatApproach?'Taking a seat…':'Take a seat';$('sit').disabled=!!(p.seatApproach||p.transition);$('sit').setAttribute('aria-pressed',String(!!p.seated));this.ui?.updatePerson();}
  updatePauseUI(){$('pause').setAttribute('aria-pressed',String(this.paused));$('pause').setAttribute('aria-label',this.paused?'Resume activity':'Pause activity');$('pause-label').textContent=this.paused?'Resume activity':'Pause activity';$('pause-icon').textContent=this.paused?'▷':'Ⅱ';this.updateStatus();}
  updateStatus(){if(this.session){this.session.refreshChrome();return;}const c=this.conversation;$('scene-state').textContent=this.paused?'A quiet moment · paused':c?`${this.people.get(c.a).name} & ${this.people.get(c.b).name} · comparing notes`:'A little focus, a little company';if(this.selected)this.updatePerson();}
  updatePerson(){const p=this.people.get(this.selected);if(!p)return;$('person-name').textContent=p.name;$('person-role').textContent=`${p.role} · ${p.kind}`;$('person-role').style.setProperty('--role-accent',PALETTES[this.mood][p.id]);$('person-description').textContent=p.description;this.ui?.updatePerson();}
  select(id){this.selected=id;$('person-card').hidden=!id;this.selection.setVisible(!!id);document.querySelectorAll('[data-person]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.person===id)));if(id){this.updatePerson();this.portrait($('person-portrait'),id);}this.ui?.onSelect(id);}
  say(id,text,duration=4){const p=this.people.get(id);p.bubble?.destroy();p.bubbleText=text;p.bubble=pixelCenter(this.add.image(Math.round(p.x),Math.round(p.y)-43,labelTexture(this,text,{background:'bubble',color:'bubbleInk',bubble:true}))).setDepth(820);p.bubbleUntil=this.elapsed+duration;this.ui?.record(p.name,text);}
  endConversation(){this.conversation=null;this.talkDots?.setVisible(false);for(const p of this.people.values()){p.bubble?.destroy();p.bubble=null;}this.updateStatus();}
  moveTo(id,target,options={}){
    const {status='Taking a short walk',onArrival=null,preserveSeatReservation=false}=options;
    const p=this.people.get(id);
    if(!preserveSeatReservation)this.seating.cancelApproach(p);
    if(p.seated){p.goal=target;this.seating.stand(p,()=>this.moveTo(id,target,options));this.updateSeatUI();return true;}
    const path=this.nav.route(p,target,[...this.people.values()].filter(other=>other!==p));
    if(!path.length)return false;
    if(this.conversation&&(this.conversation.a===id||this.conversation.b===id))this.endConversation();
    p.route=path;p.goal=target;p.blockedFor=0;p.onArrival=onArrival;p.status=status;p.bubble?.destroy();p.bubble=null;
    this.updateSeatUI();this.updateStatus();return true;
  }
  greetNearby(){this.updateStatus();}
  update(_time,delta){if(!this.ready)return;const dt=Math.min(delta/1000,.05);
    if(!this.paused){this.elapsed+=dt;}
    const previous=new Map([...this.people.values()].map(p=>[p.id,{x:p.x,y:p.y,posture:!!(p.seated||p.transition)}]));
    this.walkHuman(dt);
    for(const p of this.people.values()){
      const canMove=p.id==='human'||!this.paused;
      if(p.transition&&canMove)this.seating.update(p,dt);
      if(p.route.length&&canMove&&!p.transition){
        let budget=dt*(p.id==='human'?44:25);
        // Consume reached nodes and carry unused movement through corners. A
        // zero-length grid snap must never produce an idle frame or turn up.
        while(p.route.length&&budget>.0001&&!p.transition){
          const target=p.route[0],dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),step=Math.min(d,budget);
          const nx=p.x+(d?dx/d*step:0),ny=p.y+(d?dy/d*step:0);
          // Pause briefly for somebody already occupying the next few pixels.
          const blocked=[...this.people.values()].some(other=>other!==p&&Math.hypot(nx-other.x,ny-other.y)<11&&Math.hypot(nx-other.x,ny-other.y)<Math.hypot(p.x-other.x,p.y-other.y));
          if(blocked){
            p.blockedFor+=dt;
            if(p.blockedFor>.6){
              const reroute=this.nav.route(p,p.goal,[...this.people.values()].filter(other=>other!==p));
              if(reroute.length)p.route=reroute;
              p.blockedFor=0;
            }
            break;
          }
          p.blockedFor=0;p.x=nx;p.y=ny;budget-=step;
          if(d<=step+.0001){
            p.x=target.x;p.y=target.y;p.route.shift();
            if(!p.route.length){
              const onArrival=p.onArrival;p.onArrival=null;onArrival?.();
              if(p.id==='human')this.destination.setVisible(false);
              this.updateStatus();break;
            }
          }
        }
      }
      const old=previous.get(p.id),dx=p.x-old.x,dy=p.y-old.y;
      // Explicit chair/conversation poses take priority over locomotion facing.
      if(p.direction!==p.motion.direction)p.motion.face(p.direction);
      const final=p.route[0],nearArrival=!p.keyboardIntent&&p.route.length<=1&&(!final||Math.hypot(final.x-p.x,final.y-p.y)<3);
      const locomotion=p.motion.update(dx,dy,canMove?dt:0,{allowTurn:!nearArrival,posture:old.posture||!!(p.seated||p.transition),animateIdle:!this.paused});
      p.direction=p.motion.direction;p.keyboardIntent=false;
      const frame=this.seating.frame(p,this.elapsed)??locomotion;
      const texture=this.lighting.characterKey(p);
      if(p.sprite.texture.key!==texture)p.sprite.setTexture(texture,frame);
      p.sprite.setPosition(Math.round(p.x),Math.round(p.y)).setDepth(Math.round(p.y)).setFrame(frame);
      const labelOffset=this.conversation?.a===p.id?-4:this.conversation?.b===p.id?4:0;
      p.nameTag.setPosition(Math.round(p.x)+labelOffset,Math.round(p.y)+9).setVisible(p.id==='human'||this.selected===p.id||this.hovered===p.id||[this.conversation?.a,this.conversation?.b].includes(p.id));
      if(p.bubble){p.bubble.setPosition(Math.round(p.x),Math.round(p.y)-43);if(this.elapsed>=p.bubbleUntil){p.bubble.destroy();p.bubble=null;}}
    }
    if(this.selected){const p=this.people.get(this.selected);this.selection.setPosition(Math.round(p.x),Math.round(p.y)+1);}
    const c=this.conversation;if(c){const a=this.people.get(c.a),b=this.people.get(c.b);this.talkDots.setPosition(Math.round((a.x+b.x)/2),Math.round(Math.min(a.y,b.y))-36).setVisible(!a.bubble&&!b.bubble);}
  }
  walkHuman(dt){if(document.activeElement!==$('game'))return;const k=this.keys,dx=Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),dy=Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown);if(!dx&&!dy)return;const p=this.people.get('human');this.seating.cancelApproach(p);this.updateSeatUI();if(p.seated){this.seating.stand(p);return;}p.route=[];p.onArrival=null;this.destination.setVisible(false);const speed=44*dt/Math.hypot(dx,dy),nx=p.x+dx*speed,ny=p.y+dy*speed;const can=(x,y)=>this.nav.free(x,y)&&![...this.people.values()].some(other=>other!==p&&Math.hypot(x-other.x,y-other.y)<11);if(can(nx,p.y))p.x=nx;if(can(p.x,ny))p.y=ny;p.keyboardIntent=true;}
  inspect(){return {ready:this.ready,mood:this.mood,paused:this.paused,time:this.elapsed,selected:this.selected,conversation:this.conversation,physicalScale:this.physicalScale,people:[...this.people.values()].map(p=>({id:p.id,x:p.x,y:p.y,direction:p.direction,walking:p.route.length>0,status:p.status,seating:this.seating.inspect(p)})),furniture:WORLD.furniture.length,tileLayers:this.map.layers.length};}
}

new Phaser.Game({type:Phaser.CANVAS,parent:'game',width:WORLD.width,height:WORLD.height,transparent:true,pixelArt:true,roundPixels:true,antialias:false,antialiasGL:false,banner:false,audio:{noAudio:true},fps:{target:30,forceSetTimeOut:true},input:{keyboard:true,touch:{capture:false}},scene:Studio,render:{pixelArt:true,roundPixels:true,antialias:false}});
