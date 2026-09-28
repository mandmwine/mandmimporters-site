// Stores newsletter signups. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel env vars.
export default async function handler(req,res){ if(req.method!=='POST') return res.status(405).end(); const b=req.body||{}; if(b.website) return res.status(200).json({ok:true});
 if(!b.email) return res.status(400).json({error:'missing'});
 const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/newsletter_signups',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({email:String(b.email).toLowerCase().trim()})});
 return r.ok?res.status(200).json({ok:true}):res.status(500).json({error:'store failed'}); }
