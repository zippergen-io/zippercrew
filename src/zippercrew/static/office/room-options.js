import {api} from './session.js';

const values=room=>({name:room.name,workspace:room.config.workspace,max_rounds:String(room.config.max_rounds),human_mode:room.config.human_mode});
const changed=draft=>Object.keys(draft.value).filter(key=>draft.value[key]!==draft.saved[key]);

// A room's small option edits share one serial queue. Only the edited fields
// are applied locally, so a late response cannot restore an old task or team.
export class RoomOptions {
  constructor(session){
    this.session=session;this.rooms=new Map();
    document.getElementById('detail-dialog').addEventListener('close',()=>this.flushAll());
    window.addEventListener('beforeunload',event=>{
      if([...this.rooms.values()].some(draft=>changed(draft).length)){event.preventDefault();event.returnValue='';}
    });
  }
  get(room){
    let draft=this.rooms.get(room.id);
    if(!draft){draft={id:room.id,room,value:values(room),saved:values(room),listeners:new Set()};this.rooms.set(room.id,draft);}
    else if(!draft.pending&&!changed(draft).length){draft.room=room;draft.value=values(room);draft.saved=values(room);draft.error=null;}
    return draft;
  }
  emit(draft){for(const listener of draft.listeners)listener();}
  dirty(draft){return changed(draft).length>0;}
  edit(draft,key,value){
    draft.value[key]=value;draft.error=null;clearTimeout(draft.timer);
    draft.timer=setTimeout(()=>this.flush(draft.id).catch(()=>{}),600);this.emit(draft);
  }
  flushAll(){for(const id of this.rooms.keys())this.flush(id).catch(()=>{});}
  async flush(id){
    const draft=this.rooms.get(id);if(!draft)return;
    clearTimeout(draft.timer);
    if(draft.pending)return draft.pending;
    if(!this.dirty(draft))return;
    draft.error=null;
    draft.pending=(async()=>{
      await Promise.resolve();this.emit(draft);
      while(this.dirty(draft)){
        const keys=changed(draft),value={...draft.value},data={};
        const current=this.session.room?.id===id?this.session.room:draft.room;
        if(keys.includes('name')){
          if(!value.name.trim())throw Error('Give the room a name.');
          data.name=value.name.trim();
        }
        if(keys.some(key=>key!=='name')){
          data.config={...current.config};
          for(const key of keys.filter(key=>key!=='name'))data.config[key]=key==='max_rounds'?Number(value[key]):value[key].trim();
          if(!Number.isInteger(data.config.max_rounds)||data.config.max_rounds<1||data.config.max_rounds>100)throw Error('Choose a round limit between 1 and 100.');
        }
        const saved=await api(`/api/rooms/${id}/save`,data);draft.room=saved;
        for(const key of keys)draft.saved[key]=value[key];
        if(this.session.room?.id===id){
          for(const key of keys){
            if(key==='name')this.session.room.name=saved.name;
            else this.session.room.config[key]=saved.config[key];
          }
          this.session.refreshChrome();
        }
      }
    })().catch(error=>{draft.error=error.message;throw error;}).finally(()=>{draft.pending=null;this.emit(draft);});
    return draft.pending;
  }
}
