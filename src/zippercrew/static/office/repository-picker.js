import {api,node,button,field} from './session.js';

// Browsing is read-only; choosing a folder commits the field's normal change.
// Keep the picker inline so all room-option drafts survive navigation/cancel.
export function repositoryField(path){
  const host=node('div','','repository-field'),label=field('Repository',path),controls=node('div','','repository-controls');
  label.htmlFor=path.id;path.remove();
  const browse=button('Browse',()=>{
    panel.hidden=!panel.hidden;browse.setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden)load(path.value.trim());else generation++;
  });
  browse.className='browse-repository';browse.disabled=path.disabled;browse.setAttribute('aria-expanded','false');
  const panel=node('div','','folder-picker');panel.id='repository-browser';panel.hidden=true;panel.setAttribute('aria-label','Repository folders');
  browse.setAttribute('aria-controls',panel.id);
  const toolbar=node('div','','folder-toolbar'),home=button('Home',()=>load('')),up=button('↑ Up',()=>load(current.parent));
  home.setAttribute('aria-label','Home folder');up.setAttribute('aria-label','Parent folder');
  toolbar.append(home,up);
  const location=node('p','','folder-location'),list=node('div','','folder-list'),message=node('p','','field-help');
  message.setAttribute('role','status');
  const close=()=>{generation++;panel.hidden=true;browse.setAttribute('aria-expanded','false');browse.focus();};
  const actions=node('div','','folder-actions'),cancel=button('Cancel',close),choose=button('Use this folder',()=>{path.value=current.path;path.dispatchEvent(new Event('change',{bubbles:true}));close();},true);
  actions.append(cancel,choose);panel.append(toolbar,location,list,message,actions);
  controls.append(path,browse);host.append(label,controls,panel);
  let current=null,generation=0;
  async function load(folder){
    const request=++generation;choose.disabled=up.disabled=true;list.replaceChildren();
    list.setAttribute('aria-busy','true');location.textContent=folder||'Home';message.textContent='Loading folders…';
    try{
      const result=await api(`/api/directories?path=${encodeURIComponent(folder||'')}`);
      if(request!==generation||!host.isConnected)return;
      current=result;location.textContent=result.path;location.title=result.path;
      up.disabled=!result.parent;choose.disabled=false;message.textContent=result.directories.length?'':'No subfolders. You can use this folder.';
      for(const entry of result.directories){
        const item=button('',()=>load(entry.path));item.className='folder-entry';item.setAttribute('aria-label',`Open ${entry.name}`);item.title=entry.name;
        const icon=node('span','','folder-icon'),arrow=node('span','›','folder-arrow');icon.setAttribute('aria-hidden','true');arrow.setAttribute('aria-hidden','true');
        item.append(icon,node('span',entry.name),arrow);list.append(item);
      }
    }catch(error){if(request===generation&&host.isConnected)message.textContent=error.message;}
    finally{if(request===generation)list.setAttribute('aria-busy','false');}
  }
  panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  return host;
}
