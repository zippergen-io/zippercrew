import { WORLD } from './world.js';
import { PALETTES } from './palettes.js';
import { FOCUS } from './context.js';

const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};

// Modern DOM overlays sit outside Phaser. Opening UI never changes the camera,
// simulation, or route; controls cannot leak pointer/keyboard input into the world.
export class OfficeInterface {
  constructor(scene){
    this.scene=scene;this.panel=null;this.anchor=null;this.taskOwner=null;this.events=[];
    $('people-toggle').onclick=()=>this.togglePopover('people-popover','people-toggle');
    $('menu-toggle').onclick=()=>this.togglePopover('studio-menu','menu-toggle');
    $('close-person').onclick=()=>this.dismiss();
    $('close-task').onclick=()=>this.dismiss();
    $('person-task').onclick=()=>this.showDetails(scene.selected);
    $('task-owner').onclick=()=>scene.select(this.taskOwner);
    $('expand-task').onclick=()=>this.showDetails(this.taskOwner);
    $('walk-over').onclick=()=>this.walkOver();
    $('show-history').onclick=()=>this.showHistory();
    for(const id of ['close-detail','back-to-office'])$(id).onclick=()=>$('detail-dialog').close();
    $('detail-dialog').addEventListener('close',()=>{this.detailMode=null;$('game').focus({preventScroll:true});});
    $('detail-dialog').addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled)')];
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    $('detail-dialog').addEventListener('click',event=>{
      const r=event.currentTarget.getBoundingClientRect();
      if(event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))event.currentTarget.close();
    });
    document.addEventListener('pointerdown',event=>{
      if(!event.target.closest('.popover,#people-toggle,#menu-toggle'))this.closePopovers();
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||$('detail-dialog').open)return;
      const open=[['people-popover','people-toggle'],['studio-menu','menu-toggle']].find(([id])=>!$(id).hidden);
      if(open){this.closePopovers();$(open[1]).focus();}
      else if(this.panel)this.dismiss();
    });
    for(const p of scene.people.values())if(p.bubble)this.record(p.name,p.bubbleText);
  }

  explored(){document.body.classList.add('has-explored');}
  closePopovers(){
    for(const [panel,button] of [['people-popover','people-toggle'],['studio-menu','menu-toggle']]){
      $(panel).hidden=true;$(button).setAttribute('aria-expanded','false');
    }
  }
  togglePopover(panel,button){
    const opening=$(panel).hidden;this.dismiss(false);
    $(panel).hidden=!opening;$(button).setAttribute('aria-expanded',String(opening));
    if(opening)$(panel).querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  dismiss(focus=true){
    this.scene.select(null);$('task-card').hidden=true;this.panel=null;this.anchor=null;
    this.closePopovers();if(focus)$('game').focus({preventScroll:true});
  }
  onSelect(id){
    if(!id){if(this.panel==='person-card'){this.panel=null;this.anchor=null;}return;}
    this.closePopovers();$('task-card').hidden=true;this.explored();
    const p=this.scene.people.get(id);
    const neighbors=[...this.scene.people.values()].filter(other=>Math.hypot(other.x-p.x,other.y-p.y)<40);
    this.panel='person-card';this.anchor={x:Math.max(...neighbors.map(other=>other.x))+12,y:p.y-25};
    // Selecting someone from the roster also finds them on a small, panned view.
    const view=$('scene-scroll'),bounds=view.getBoundingClientRect(),canvas=this.scene.game.canvas.getBoundingClientRect();
    const x=canvas.left+p.x*canvas.width/WORLD.width,y=canvas.top+p.y*canvas.height/WORLD.height;
    if(x<bounds.left+40||x>bounds.right-40)view.scrollLeft+=x-(bounds.left+bounds.width/2);
    if(y<bounds.top+80||y>bounds.bottom-80)view.scrollTop+=y-(bounds.top+bounds.height/2);
    this.updatePerson();this.reposition();$('close-person').focus({preventScroll:true});
  }
  updatePerson(){
    const p=this.scene.people.get(this.scene.selected);if(!p)return;
    $('person-activity').textContent=p.status;
    $('person-task-title').textContent=FOCUS[p.id].title;
    $('walk-over').firstChild.textContent=p.id==='human'?(p.seated?'Stand up':'Take a seat'):'Walk over';
    $('walk-over').disabled=!!(p.id==='human'&&(p.seatApproach||p.transition));
  }
  showTask(owner){
    this.dismiss(false);this.explored();this.taskOwner=owner;
    const p=this.scene.people.get(owner),task=FOCUS[owner],desk=WORLD.furniture.find(f=>f.owner===owner);
    $('task-location').textContent=owner==='human'?'Your desk':`${p.name}’s desk`;
    $('task-state').textContent=task.state;$('task-title').textContent=task.title;
    $('task-summary').textContent=task.summary;$('task-owner').textContent=`${p.name} · ${p.role}`;
    $('task-owner').style.setProperty('--role-accent',PALETTES[this.scene.mood][owner]);
    $('task-card').hidden=false;this.panel='task-card';this.anchor={x:desk.x+82,y:desk.y+12};
    this.reposition();$('close-task').focus({preventScroll:true});
  }
  reposition(){
    if(!this.panel||!this.anchor)return;
    const panel=$(this.panel),r=this.scene.game.canvas.getBoundingClientRect();
    const x=r.left+this.anchor.x*r.width/WORLD.width,y=r.top+this.anchor.y*r.height/WORLD.height;
    const width=panel.offsetWidth,height=panel.offsetHeight;
    const right=x+38,left=x-width-38;
    panel.style.left=`${Math.round(Math.max(16,Math.min(innerWidth-width-16,right+width<=innerWidth-16?right:left)))}px`;
    panel.style.top=`${Math.round(Math.max(78,Math.min(innerHeight-height-72,y-42)))}px`;
  }
  walkOver(){
    const p=this.scene.people.get(this.scene.selected);if(!p)return;
    if(p.id==='human'){$('sit').click();this.dismiss();return;}
    const you=this.scene.people.get('human'),target={x:p.x+(you.x<p.x?-24:24),y:p.y+8};
    const moved=this.scene.moveTo('human',target,{status:`Walking over to ${p.name}`,onArrival:()=>{
      you.status=`Catching up with ${p.name}`;this.scene.greetNearby();
    }});
    if(moved)this.dismiss();else $('person-activity').textContent='Waiting for a clear path';
  }
  showDetails(owner){
    const p=this.scene.people.get(owner),task=FOCUS[owner];this.dismiss(false);
    $('detail-kind').textContent='Current focus';$('detail-title').textContent=task.title;
    $('detail-description').textContent=task.summary;$('detail-note').textContent='Example task · visual preview';
    const meta=el('div',null,'task-meta');meta.append(el('span',`${p.name} · ${p.role}`),el('span',task.state));
    const list=el('ul',null,'checklist');
    for(const [text,done] of task.steps){const item=el('li',text,done?'done':'');item.setAttribute('aria-label',`${done?'Done':'To do'}: ${text}`);list.append(item);}
    $('detail-body').replaceChildren(meta,el('h3','A few next steps','detail-subtitle'),list);
    this.detailMode='task';$('detail-dialog').showModal();$('close-detail').focus();
  }
  record(name,text){
    this.events.unshift({name,text,time:this.scene.elapsed});this.events=this.events.slice(0,30);
    if(this.detailMode==='history')this.renderHistory();
  }
  showHistory(){
    this.dismiss(false);this.detailMode='history';
    $('detail-kind').textContent='Around the studio';$('detail-title').textContent='Recent activity';
    $('detail-description').textContent='A few words exchanged in this office session.';
    $('detail-note').textContent='This session · scripted activity';this.renderHistory();
    $('detail-dialog').showModal();$('close-detail').focus();
  }
  renderHistory(){
    const list=el('ol',null,'activity-list');
    for(const item of this.events){
      const row=el('li'),time=el('time',`${Math.floor(item.time/60)}:${String(Math.floor(item.time%60)).padStart(2,'0')}`),copy=el('div');
      copy.append(el('strong',item.name),el('p',item.text[0]+item.text.slice(1).toLowerCase()));row.append(time,copy);list.append(row);
    }
    if(!this.events.length)list.append(el('li','A quiet moment. New conversations will appear here.'));
    $('detail-body').replaceChildren(list);
  }
}
