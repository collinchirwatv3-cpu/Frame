// Exact seed identities only. Default is read-only; --apply removes verified demo rows.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const manifest = JSON.parse(await readFile(new URL('./demo-manifest.json', import.meta.url)));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const apply = process.argv.includes('--apply');
async function checked(query) { const {data,error} = await query; if(error) throw error; return data; }
const ids = manifest.creators.map(c => c.id);
const profiles = await checked(db.from('profiles').select('*').in('id', ids));
const videos = await checked(db.from('videos').select('*').or(`id.in.(${manifest.videoIds.join(',')}),creator_id.in.(${ids.join(',')})`));
const collections = await checked(db.from('collections').select('*').in('id',manifest.collectionIds));
const members = await checked(db.from('collection_videos').select('*').in('collection_id',manifest.collectionIds));
for (const p of profiles) {
 const expected = manifest.creators.find(c => c.id===p.id);
 if(p.username!==expected.username) throw new Error('Seed profile identity changed; stopping');
}
const authIds=[];
for (const creator of manifest.creators) {
 const {data,error}=await db.auth.admin.getUserById(creator.id);
 if(error && error.status!==404) throw error;
 if(data?.user) {
  if(data.user.email!==creator.email) throw new Error('Seed auth identity changed; stopping');
  authIds.push(creator.id);
 }
}
for (const v of videos) {
 if(!manifest.videoIds.includes(v.id)||!ids.includes(v.creator_id)||v.stream_uid||!/^https:\/\/(placeholdervideo\.dev|commondatastorage\.googleapis\.com)\//.test(v.playback_url??'')) throw new Error('Non-demo video found in deletion scope; stopping');
}
if(members.some(m=>!manifest.videoIds.includes(m.video_id))) throw new Error('Collection contains non-demo video; stopping');
for(const c of collections) {
 if(!c.cover_url?.startsWith('https://picsum.photos/seed/')) throw new Error('Collection changed; stopping');
}
console.log(JSON.stringify({mode:apply?'apply':'preview',profiles:profiles.map(p=>p.username),videos:videos.length,collections:collections.length,authUsers:authIds.length}));
if(apply) {
 const otherProfiles = await checked(db.from('profiles').select('id').not('id','in',`(${ids.join(',')})`));
 const otherVideos = await checked(db.from('videos').select('id').not('id','in',`(${manifest.videoIds.join(',')})`));
 // Snapshot content before removal. This does not claim to back up auth identities
 // or every cascading interaction; those belong to the removed demo content.
 await mkdir('.scratch',{recursive:true});
 await writeFile(`.scratch/demo-content-before-removal-${Date.now()}.json`,JSON.stringify({profiles,videos,collections,members},null,2),{mode:0o600});
 await checked(db.from('collections').delete().in('id',manifest.collectionIds));
 await checked(db.from('videos').delete().in('id',manifest.videoIds));
 for(const id of authIds) { const {error}=await db.auth.admin.deleteUser(id); if(error) throw error; }
 const remaining = await checked(db.from('profiles').select('id').in('id',ids));
 if(remaining.length) throw new Error('Seed profiles remain; inspect before further deletion');
 const afterProfiles = new Set((await checked(db.from('profiles').select('id'))).map(p=>p.id));
 const afterVideos = new Set((await checked(db.from('videos').select('id'))).map(v=>v.id));
 if(otherProfiles.some(p=>!afterProfiles.has(p.id)) || otherVideos.some(v=>!afterVideos.has(v.id))) throw new Error('Non-demo record preservation check failed');
 console.log(`Preserved ${otherProfiles.length} non-demo profiles and ${otherVideos.length} non-demo videos. Run preview again to verify all target counts.`);
}
