const testenv = false;
let currentterm = null;
const currentRequests = new Map();
const eventIDs = new Map();
async function requestBanner(url, method = "GET", body = null, timeout = null) {
  const nonce = crypto.randomUUID();
  const controller = new AbortController();
  currentRequests.set(nonce, { url, controller, timestamp: new Date().getTime() });
  try {
    let headers = { "X-Ext-ID": nonce };
    if (body) headers["content-type"] = "application/x-www-form-urlencoded";
    const response = await fetch(url, {
      method: method,
      referrerPolicy: "no-referrer",
      headers: headers,
      signal: controller.signal,
      credentials: "include",
      mode: "cors",
      body: body,
    });

    currentRequests.get(nonce).status = response.status;
    currentRequests.get(nonce).finalUrl = response.url;
    currentRequests.get(nonce).body = await response.clone().text();
    const stored = currentRequests.get(nonce);
    currentRequests.delete(nonce);
    return stored;
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.log("Fetch aborted because of redirection: ", nonce);
      currentRequests.get(nonce).status = 302;
      const stored = currentRequests.get(nonce);
      currentRequests.delete(nonce);
      return stored;
    }
    console.error("Fetch error for request:", nonce, err);
    currentRequests.delete(nonce);
    throw err;
  }
}
async function GetSession(attempt = 0) {
  let rp = { attempt: attempt };

  try {
    const res = await requestBanner("https://suis.sabanciuniv.edu/" + (testenv ? "dolly" : "prod") + "/twbkwbis.P_SabanciLogin", 'GET', null, 10000);
    if (res.status == 302 || res.redirectUrl) {
      rp.status = "FAILED";
      rp.code = res.status;
      rp.location = res.redirectUrl || null;
    }
    else if (res.status === 200) {
      rp.status = "SUCCESS";
      rp.headers = res.headers;
    }
    else {
      console.log("Request " + attempt + " failed with status: " + res.status + " " + res.statusText);
      rp.status = "FAILED";
      rp.code = res.status;
      rp.codeText = res.statusText;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      rp.status = "FAILED";
      rp.code = "TIMEOUT";
    } else {
      rp.status = "FAILED";
      rp.code = error.message;
    }
  }
  return rp;
}
function parseCookies(cookieString) {
  let cookies = [];
  let pos = 0;
  let currentcookie = {};
  while (cookieString.length > 0) {
    if (cookieString.startsWith(';')) {
      cookieString = cookieString.substring(1).trim();
    }
    pos = cookieString.indexOf(';');
    let substr = cookieString.substring(0, pos);
    if (!currentcookie.name) {
      currentcookie.name = substr.split('=')[0].trim();
      currentcookie.value = substr.split('=')[1].trim();
    }
    else if (substr.split('=')[0].trim().toLowerCase() === 'expires') {
      pos = cookieString.indexOf('GMT') + 2;
      substr = cookieString.substring(0, pos + 1);
      const expiry = Math.floor(new Date(substr.split('=')[1].trim()).getTime() / 1000);
      currentcookie['expirationDate'] = expiry;
    }
    else {
      currentcookie[substr.split('=')[0].trim().toLowerCase()] = substr.split('=')[1] ? substr.split('=')[1].trim() : true;
    }
    cookieString = cookieString.substring(pos + 1).trim();
    if (cookieString.startsWith(',') || cookieString.startsWith(';,')) {
      cookies.push(currentcookie);
      currentcookie = {};
      cookieString = cookieString.substring(1).trim();
      if (cookieString.startsWith(',')) {
        cookieString = cookieString.substring(1).trim();
      }
    }
  }
  if (currentcookie.name) {
    cookies.push(currentcookie);
  }
  cookies.forEach(c => {
    if (c['']) delete c[''];
    c.domain = c.domain ? c.domain : 'suis.sabanciuniv.edu';
  });
  return cookies;
}
function setCookie(url, details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.set(Object.assign({ url }, details), (cookie) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(err);
      resolve(cookie);
    });
  });
}

async function LoginOnce(username, password, term, loadpage = []) {
  const loginPage = await requestBanner(
    "https://suis.sabanciuniv.edu/" +
      (testenv ? "dolly" : "prod") +
      "/twbkwbis.P_SabanciLogin"
  );

  if (loginPage.status !== 200) {
    return { ok: false, msg: "Unable to receive a Bannerweb login session" };
  }

  const params = new URLSearchParams({ sid: username, PIN: password });
  const loginRes = await requestBanner(
    "https://suis.sabanciuniv.edu/" +
      (testenv ? "dolly" : "prod") +
      "/twbkwbis.P_ValLogin?" +
      params.toString()
  );

  if (
    loginRes.status === 302 &&
    loginRes.redirectUrl?.includes("twbkwbis.P_GenMenu?name=bmenu.P_MainMnu")
  ) {
    for (const pageTerm of loadpage) {
      chrome.tabs.create({
        url:
          "https://suis.sabanciuniv.edu/" +
          (testenv ? "dolly" : "prod") +
          "/bwskfreg.P_AltPin?term_in=" +
          encodeURIComponent(pageTerm),
        active: true
      });
    }

    return await CheckSession(term);
  }

  return { ok: false, msg: "Invalid username or password, or Bannerweb rejected the login attempt" };
}

async function broadcastSessionChanged(term) {
  const urlPatterns = [
    "https://lastpotatos.github.io/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ];

  try {
    const tabs = await chrome.tabs.query({ url: urlPatterns });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, {
        action: "bannerSessionChanged",
        term
      }).catch(() => {});
    }
  } catch (error) {
    console.warn("Unable to broadcast Bannerweb session update:", error);
  }
}

async function GetDetailedRegistration(term) {
  const response = await requestBanner("https://suis.sabanciuniv.edu/" + (testenv ? "dolly" : "prod") + "/bwskfshd.P_CrseSchdDetl?term_in=" + term);
  if (response.status === 200) {
    return { ok: true, html: response.body, headers: response.headers }
  }
  else {
    return { ok: false, msg: "Unable to reach course information page" };
  }
}
function GetLink(term, adds, drops) {
  let formurl = "https://suis.sabanciuniv.edu/" + (testenv ? "dolly" : "prod") + "/su_registration.p_su_register?term_in=" + term + "&RSTS_IN=DUMMY&assoc_term_in=DUMMY&CRN_IN=DUMMY&start_date_in=DUMMY&end_date_in=DUMMY&SUBJ=DUMMY&CRSE=DUMMY&SEC=DUMMY&LEVL=DUMMY&CRED=DUMMY&GMOD=DUMMY&TITLE=DUMMY&MESG=DUMMY&REG_BTN=DUMMY&MESG=DUMMY";
  drops.forEach(e => {
    formurl += "&RSTS_IN=DW&assoc_term_in=&CRN_IN=" + e + "&start_date_in=&end_date_in=&SUBJ=&CRSE=&SEC=&LEVL=&CRED=&GMOD=&TITLE=&MESG=DUMMY";
  });
  adds.forEach(e => {
    formurl += "&RSTS_IN=RW&CRN_IN=" + e + "&assoc_term_in=&start_date_in=&end_date_in=";
  });
  formurl += "&regs_row=" + drops.length + "&wait_row=0&add_row=" + adds.length + "&REG_BTN=Submit+Changes";
  return formurl;
}
async function SubmitChanges(term, adds, drops) {
  const formurl = GetLink(term, adds, drops);
  const response = await requestBanner(formurl);
  if (response.status === 200) {
    return { ok: true, html: response.body, headers: response.headers }
  }
  else {
    let desc = "Unknown error occured";
    if (response.status === 302) {
      if (response.redirectUrl?.includes("twbkwbis.P_ValLogin")) {
        desc = "Your session has expired. Please log in again.";
      }
      else {
        desc = "We were redirected to somewhere else, possibly due to session expiration.";
      }
    }
    else {
      desc = "Received status code " + response.status;
    }
    return { ok: false, msg: "Unable to submit changes", desc: desc };
  }
}
async function CheckCourse(term, code, number) {
  const formurl = "https://suis.sabanciuniv.edu/prod/bwckgens.P_RegsGetCrse?term_in=" + term + "&sel_subj=dummy&sel_subj=" + code + "&SEL_CRSE=" + number + "&SEL_TITLE=&BEGIN_HH=0&BEGIN_MI=0&BEGIN_AP=a&SEL_DAY=dummy&SEL_PTRM=dummy&END_HH=0&END_MI=0&END_AP=a&SEL_CAMP=dummy&SEL_SCHD=dummy&SEL_SESS=dummy&SEL_INSTR=dummy&SEL_INSTR=%25&SEL_ATTR=dummy&SEL_ATTR=%25&SEL_LEVL=dummy&SEL_LEVL=%25&SEL_INSM=dummy&sel_dunt_code=&sel_dunt_unit=&call_value_in=&rsts=dummy&assoc_term_in=dummy&crn=dummy&start_date_in=dummy&end_date_in=dummy&subj=dummy&crse=dummy&sec=dummy&levl=dummy&gmod=dummy&cred=dummy&title=dummy&mesg=dummy&regs_row=0&add_row=0&wait_row=0&path=2&SUB_BTN=View+Sections";
  const response = await requestBanner(formurl);
  if (response.status === 200) {
    return { ok: true, html: response.body, headers: response.headers }
  }
  else {
    let desc = "Unknown error occured";
    let short = "Unknown";
    if (response.status === 302) {
      if (response.redirectUrl?.includes("twbkwbis.P_ValLogin")) {
        desc = "Your session has expired. Please log in again.";
        short = "Login again";
      }
      else {
        desc = "We were redirected to somewhere else, possibly due to session expiration.";
        short = "Login again";
      }
    }
    else {
      desc = "Received status code " + response.status;
      short = response.status;
    }
    return { ok: false, msg: "Unable to search courses", desc: desc, short: short };
  }
}
async function CheckCRN(term, code) {
  const formurl = "https://suis.sabanciuniv.edu/prod/bwckschd.p_disp_detail_sched?term_in=" + term + "&crn_in=" + code;
  const response = await requestBanner(formurl);
  if (response.status === 200) {
    return { ok: true, html: response.body, headers: response.headers }
  }
  else {
    let desc = "Unknown error occured";
    let short = "Unknown";
    if (response.status === 302) {
      if (response.redirectUrl?.includes("twbkwbis.P_ValLogin")) {
        desc = "Your session has expired. Please log in again.";
        short = "Login again";
      }
      else {
        desc = "We were redirected to somewhere else, possibly due to session expiration.";
        short = "Login again";
      }
    }
    else {
      desc = "Received status code " + response.status;
      short = response.status;
    }
    return { ok: false, msg: "Unable to search courses", desc: desc, short: short };
  }
}
async function CheckSession(term) {
  const response = await requestBanner("https://suis.sabanciuniv.edu/" + (testenv ? "dolly" : "prod") + "/bwskfreg.P_AltPin?term_in=" + term);
  if (response.status === 200) {
    if (response.body.includes('twbkwbis.P_ValLogin')) return { ok: false, msg: "SESSION: Session disappeared. Login button shown" };
    else return { ok: true, html: response.body, headers: response.headers }
  }
  else {
    return { ok: false, msg: "SESSION: Session either nonexistant or expired. Login button shown." };
  }
}
async function RemoveSession() {
  const response = await requestBanner("https://suis.sabanciuniv.edu/" + (testenv ? "dolly" : "prod") + "/twbkwbis.P_Logout");
  if (response.status === 200) {
    return { ok: true, html: response.body }
  }
  else {
    return { ok: false, msg: "SESSION: Failed to logout" };
  }
}
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const reqId = details.requestHeaders?.find(h => h.name === "X-Ext-ID")?.value;
    if (reqId && currentRequests.has(reqId)) {
      eventIDs.set(details.requestId, reqId);
    }
    else {
      console.log({ headers: details.requestHeaders });
    }
  },
  { urls: ["https://suis.sabanciuniv.edu/*"] },
  ["requestHeaders", "extraHeaders"]
);
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const headers = details.responseHeaders || [];
    const location = headers.find(h => h.name.toLowerCase() === "location")?.value;
    if (eventIDs.has(details.requestId)) {
      const reqID = eventIDs.get(details.requestId);
      eventIDs.delete(details.requestId);
      if (currentRequests.has(reqID)) {
        currentRequests.get(reqID).headers = headers;
        currentRequests.get(reqID).redirectUrl = location;
        if (location) {
          currentRequests.get(reqID).controller.abort();
        }
      }
    }
  },
  { urls: ["https://suis.sabanciuniv.edu/*"] },
  ["responseHeaders", "extraHeaders"]
);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.action) {
    case "login": {
      (async () => {
        currentterm = message.term;
        const resp = await LoginOnce(
          message.username,
          message.password,
          message.term,
          message.loadpages || []
        );
        if (resp.ok) await broadcastSessionChanged(message.term);
        sendResponse(resp);
      })();
      return true;
    }
    case "openlogin": {
      (async () => {
        const term = String(message.term || currentterm || "");
        await chrome.storage.local.set({ bannerTerm: term });
        chrome.tabs.create({
          url: chrome.runtime.getURL(
            "login.html?term=" + encodeURIComponent(term)
          ),
          active: true
        });
        sendResponse({ ok: true });
      })();
      return true;
    }
    case "checksession": {
      (async () => {
        currentterm = message.term;
        const resp = await CheckSession(message.term);
        sendResponse(resp);
      })();
      return true;
    }
    case "getdetailedcourses": {
      (async () => {
        currentterm = message.term;
        const resp = await GetDetailedRegistration(message.term);
        sendResponse(resp);
      })();
      return true;
    }
    case "submitchanges": {
      (async () => {
        currentterm = message.term;
        const resp = await SubmitChanges(
          message.term,
          message.adds || [],
          message.drops || []
        );
        if (resp.ok) await broadcastSessionChanged(message.term);
        sendResponse(resp);
      })();
      return true;
    }
    case "checkcourse": {
      (async () => {
        currentterm = message.term;
        const resp = await CheckCourse(message.term, message.code, message.number);
        sendResponse(resp);
      })();
      return true;
    }
    case "checkcrn": {
      (async () => {
        currentterm = message.term;
        const resp = await CheckCRN(message.term, message.code);
        sendResponse(resp);
      })();
      return true;
    }
    case "logout": {
      (async () => {
        const term = message.term || currentterm;
        const resp = await RemoveSession(term);
        await broadcastSessionChanged(term);
        sendResponse(resp);
      })();
      return true;
    }
    case "checktest": {
      sendResponse(testenv);
      return true;
    }
    case "opentermform": {
      const term = String(message.term || currentterm || "");
      if (!term) {
        sendResponse({ ok: false, msg: "No term selected" });
        return true;
      }
      chrome.tabs.create({
        url:
          "https://suis.sabanciuniv.edu/" +
          (testenv ? "dolly" : "prod") +
          "/bwskfreg.P_AltPin?term_in=" +
          encodeURIComponent(term),
        active: true
      });
      sendResponse({ ok: true });
      return true;
    }
    case "openschedule": {
      chrome.tabs.create({
        url: "https://suis.sabanciuniv.edu/prod/bwskfshd.P_CrseSchd",
        active: true
      });
      sendResponse({ ok: true });
      return true;
    }
    default: {
      sendResponse({ ok: false, msg: "Unknown action" });
      return true;
    }
  }
});
