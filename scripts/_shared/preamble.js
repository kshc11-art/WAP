/* WAP-ID START — 자동 생성. 손대지 마세요. */
var WAP_ID='@@SLUG@@', WAP_VER='@@VERSION@@', WAP_BASE='@@BASE@@', WAP_HALT='';
try {
  if (localStorage.getItem('wap.kill')==='1' || localStorage.getItem('wap.kill.'+WAP_ID)==='1') WAP_HALT='kill';
  else if (window['__wap_'+WAP_ID]) WAP_HALT='dup';
  else {
    window['__wap_'+WAP_ID]=WAP_VER;
    (window.__WAP=window.__WAP||[]).push({id:WAP_ID,ver:WAP_VER,base:WAP_BASE});
    localStorage.setItem('wap.installed.'+WAP_ID, WAP_VER+'|'+WAP_BASE);
  }
} catch(e) {}
if (WAP_HALT) { console.warn('[WAP] '+WAP_ID+' 중단: '+WAP_HALT); throw new Error('WAP_HALT'); }
/* WAP-ID END */
