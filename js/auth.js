// Utilidades de autenticación compartidas por login.html y app.html.
// loginPath: ruta relativa a pages/login.html desde donde se llama.
async function requireAuth(loginPath){
  const { data:{ session } } = await window.supabaseClient.auth.getSession();
  if(!session){
    window.location.href = loginPath || 'login.html';
    return null;
  }
  return session;
}

async function logout(loginPath){
  await window.supabaseClient.auth.signOut();
  window.location.href = loginPath || 'login.html';
}

window.supabaseClient.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT' && !location.pathname.endsWith('login.html')){
    window.location.href = 'login.html';
  }
});
