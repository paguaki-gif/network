"use strict";

/* =========================================================================
   新米エンジニア！学校のLANを繋げ
   モード1：IPアドレスの割り当てパズル
   モード2：IPアドレス競合のトラブルシューティング
   ========================================================================= */

/* ルータ（＝このLANの基準）*/
const ROUTER_IP  = "192.168.1.1";
const NETWORK    = "192.168.1";     // ネットワーク部
const HOST_MIN   = 2;               // .1 はルータが使用中
const HOST_MAX   = 254;             // .255 はブロードキャスト

/* ------------------------------------------------------------------ */
/* 汎用ユーティリティ                                                   */
/* ------------------------------------------------------------------ */

/** "192.168.1.10" → { net:"192.168.1", host:10 }。不正な形式なら null */
function parseIp(text){
  const parts = String(text).trim().split(".");
  if (parts.length !== 4) return null;
  const nums = [];
  for (const p of parts){
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return { net: nums.slice(0, 3).join("."), host: nums[3], text: nums.join(".") };
}

/** ログを1行追加する。kind: "ok" | "bad" | "warn" | "info" */
function addLog(listEl, kind, message){
  const now  = new Date();
  const time = String(now.getHours()).padStart(2, "0") + ":" +
               String(now.getMinutes()).padStart(2, "0") + ":" +
               String(now.getSeconds()).padStart(2, "0");

  const li = document.createElement("li");
  li.className = kind;
  const t = document.createElement("span");
  t.className = "log-time";
  t.textContent = time;
  li.append(t, document.createTextNode(message));

  listEl.prepend(li);                      // 新しいものを上に
  while (listEl.children.length > 40) listEl.lastElementChild.remove();
}

/* クリア演出のオーバーレイ */
const overlay      = document.getElementById("overlay");
const overlayTitle = document.getElementById("ov-title");
const overlayText  = document.getElementById("ov-text");

function showOverlay(title, text){
  overlayTitle.textContent = title;
  overlayText.textContent  = text;
  overlay.classList.remove("is-hidden");
  document.getElementById("ov-close").focus();
}
document.getElementById("ov-close").addEventListener("click", () => {
  overlay.classList.add("is-hidden");
});
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) overlay.classList.add("is-hidden");
});

/* ------------------------------------------------------------------ */
/* モード切替タブ                                                       */
/* ------------------------------------------------------------------ */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      const active = t === tab;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    document.getElementById("mode-1").classList.toggle("is-hidden", tab.dataset.mode !== "1");
    document.getElementById("mode-2").classList.toggle("is-hidden", tab.dataset.mode !== "2");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});


/* =========================================================================
   モード1：IPアドレスを割り当てよう
   ========================================================================= */

const M1 = {
  log:   document.getElementById("log-1"),
  tray:  document.getElementById("card-tray"),
  row:   document.getElementById("pc-row"),
  cards: [],       // { id, ip, placedOn: pcId | null }
  pcs:   [],       // { id, name, cardId | null }
  picked: null,    // タップ操作で選択中のカードid
  cleared: false,
};

/** 初期データを作る（やり直しでも使う） */
function m1Init(){
  M1.cards = [
    { id:"c1", ip:"192.168.1.10", placedOn:null },
    { id:"c2", ip:"192.168.1.20", placedOn:null },
    { id:"c3", ip:"192.168.1.30", placedOn:null },
    { id:"c4", ip:"192.168.1.40", placedOn:null },
    { id:"c5", ip:"192.168.1.10", placedOn:null },  // 重複ダミー
    { id:"c6", ip:"192.168.2.10", placedOn:null },  // 別ネットワークのダミー
  ];
  M1.pcs = [
    { id:"pc1", name:"PC1", cardId:null },
    { id:"pc2", name:"PC2", cardId:null },
    { id:"pc3", name:"PC3", cardId:null },
    { id:"pc4", name:"PC4", cardId:null },
  ];
  M1.picked  = null;
  M1.cleared = false;

  M1.log.innerHTML = "";
  buildPcRow();
  m1Render();
  addLog(M1.log, "info",
    "4台とも未設定です。ルータ（192.168.1.1）と同じグループのアドレスを配ってください。");
}

/** PC4台のDOMを組み立てる（1度だけ） */
function buildPcRow(){
  M1.row.innerHTML = "";
  M1.pcs.forEach((pc) => {
    const col = document.createElement("div");
    col.className = "pc-col";
    col.id = "col-" + pc.id;

    col.innerHTML = `
      <div class="drop-line"></div>
      <div class="pc">
        <div class="pc-screen">🖥️</div>
        <div class="pc-name">${pc.name}</div>
        <div class="slot" data-pc="${pc.id}" tabindex="0" role="button"
             aria-label="${pc.name} のアドレス枠">未設定</div>
        <div class="pc-status"></div>
      </div>`;

    const slot = col.querySelector(".slot");

    /* --- HTML5 ドラッグ＆ドロップ --- */
    slot.addEventListener("dragover", (e) => {
      e.preventDefault();
      slot.classList.add("is-over");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("is-over");
      const cardId = e.dataTransfer.getData("text/plain");
      if (cardId) placeCard(cardId, pc.id);
    });

    /* --- タップ／クリック操作 --- */
    slot.addEventListener("click", () => {
      if (M1.picked){
        placeCard(M1.picked, pc.id);
        M1.picked = null;
      } else if (pc.cardId){
        removeCard(pc.id);           // 選択カードが無ければ回収
      } else {
        addLog(M1.log, "info", "先に手札のカードを選んでから、枠を押してください。");
      }
      m1Render();
    });
    slot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        slot.click();
      }
    });

    M1.row.appendChild(col);
  });
}

/** カードをPCに置く（すでに置かれていれば入れ替え） */
function placeCard(cardId, pcId){
  const card = M1.cards.find((c) => c.id === cardId);
  const pc   = M1.pcs.find((p) => p.id === pcId);
  if (!card || !pc) return;

  // その枠に別のカードがあれば手札に戻す
  if (pc.cardId && pc.cardId !== cardId){
    const old = M1.cards.find((c) => c.id === pc.cardId);
    if (old) old.placedOn = null;
  }
  // このカードが他の枠にあれば外す
  if (card.placedOn){
    const prev = M1.pcs.find((p) => p.id === card.placedOn);
    if (prev) prev.cardId = null;
  }

  pc.cardId     = card.id;
  card.placedOn = pc.id;

  m1Render();
  reportPlacement(pc, card);
}

/** 枠からカードを手札に戻す */
function removeCard(pcId){
  const pc = M1.pcs.find((p) => p.id === pcId);
  if (!pc || !pc.cardId) return;
  const card = M1.cards.find((c) => c.id === pc.cardId);
  if (card) card.placedOn = null;
  pc.cardId = null;
  addLog(M1.log, "info", `${pc.name} のアドレスを取り外しました。`);
}

/** 現在の配置から各PCの状態を求める：ok / dup / bad / none */
function m1Status(){
  const result = {};
  // 配置済みアドレスの出現回数
  const count = {};
  M1.pcs.forEach((pc) => {
    if (!pc.cardId) return;
    const ip = M1.cards.find((c) => c.id === pc.cardId).ip;
    count[ip] = (count[ip] || 0) + 1;
  });

  M1.pcs.forEach((pc) => {
    if (!pc.cardId){ result[pc.id] = "none"; return; }
    const ip     = M1.cards.find((c) => c.id === pc.cardId).ip;
    const parsed = parseIp(ip);
    if (!parsed || parsed.net !== NETWORK)      result[pc.id] = "bad";
    else if (count[ip] > 1)                     result[pc.id] = "dup";
    else                                        result[pc.id] = "ok";
  });
  return result;
}

/** 置いた直後のメッセージを出す */
function reportPlacement(pc, card){
  const st = m1Status()[pc.id];

  if (st === "ok"){
    addLog(M1.log, "ok",
      `${pc.name} にIPアドレス ${card.ip} が正しく設定され、ルータと通信可能になりました！`);
  } else if (st === "dup"){
    const others = M1.pcs.filter(
      (p) => p.id !== pc.id && p.cardId &&
             M1.cards.find((c) => c.id === p.cardId).ip === card.ip
    ).map((p) => p.name).join("・");
    addLog(M1.log, "bad",
      `⚠️ IPアドレスが衝突しました！同じネットワーク内で住所の重複はできません。（${pc.name} と ${others} が ${card.ip}）`);
  } else if (st === "bad"){
    addLog(M1.log, "warn",
      `❌ グループの番号（サブネット）が違います。ルータ（${ROUTER_IP}）と同じグループの数値を設定してください。（${card.ip}）`);
  }
  checkM1Clear();
}

/** 画面を現在の状態に合わせて描き直す */
function m1Render(){
  // 手札
  M1.tray.innerHTML = "";
  M1.cards.filter((c) => !c.placedOn).forEach((card) => {
    const el = document.createElement("div");
    el.className = "card" + (M1.picked === card.id ? " is-picked" : "");
    el.draggable = true;
    el.tabIndex  = 0;
    el.setAttribute("role", "button");
    el.innerHTML = `<span class="card-grip" aria-hidden="true">⠿</span>${card.ip}`;

    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.id);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("is-dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("is-dragging"));

    el.addEventListener("click", () => {
      M1.picked = (M1.picked === card.id) ? null : card.id;
      m1Render();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); el.click(); }
    });

    M1.tray.appendChild(el);
  });

  // PC側
  const status = m1Status();
  M1.pcs.forEach((pc) => {
    const col    = document.getElementById("col-" + pc.id);
    const slot   = col.querySelector(".slot");
    const stEl   = col.querySelector(".pc-status");
    const card   = pc.cardId ? M1.cards.find((c) => c.id === pc.cardId) : null;
    const st     = status[pc.id];

    slot.textContent = card ? card.ip : "未設定";
    slot.classList.toggle("has-card", Boolean(card));

    col.classList.remove("is-ok", "is-dup", "is-bad");
    if (st === "ok")       { col.classList.add("is-ok");  stEl.textContent = "開通"; }
    else if (st === "dup") { col.classList.add("is-dup"); stEl.textContent = "アドレス衝突"; }
    else if (st === "bad") { col.classList.add("is-bad"); stEl.textContent = "グループ違い"; }
    else                   { stEl.textContent = ""; }
  });
}

/** クリア判定 */
function checkM1Clear(){
  if (M1.cleared) return;
  const status = m1Status();
  const allOk  = M1.pcs.every((pc) => status[pc.id] === "ok");
  if (!allOk) return;

  M1.cleared = true;
  addLog(M1.log, "ok", "🎉 4台すべてが開通しました。ネットワークの完成です！");
  showOverlay("ステージクリア！お見事！",
    "4台とも同じグループ（192.168.1.×）で、重複のないアドレスになりました。これがLANの基本ルールです。");
}

document.getElementById("m1-reset").addEventListener("click", m1Init);


/* =========================================================================
   モード2：犯人を探せ！ネットワークの競合
   ========================================================================= */

const M2 = {
  log:    document.getElementById("log-2"),
  grid:   document.getElementById("lan-grid"),
  wrap:   document.getElementById("lan-wrap"),
  layer:  document.getElementById("packet-layer"),
  pcs:    [],
  diag:   false,       // 診断ツールの状態
  selected: null,      // 調査中のPC id
  manualFixDone: false,
  dhcpUsed: false,
  cleared: false,
};

const propPanel = document.getElementById("prop-form");
const propEmpty = document.getElementById("prop-empty");
const propTarget= document.getElementById("prop-target");
const propMsg   = document.getElementById("prop-msg");
const ipInput   = document.getElementById("ip-input");

/** 初期データ：PC-C と PC-G が 192.168.1.50 で競合している */
function m2Init(){
  M2.pcs = [
    { id:"PC-A", ip:"192.168.1.11" },
    { id:"PC-B", ip:"192.168.1.12" },
    { id:"PC-C", ip:"192.168.1.50" },   // 競合
    { id:"PC-D", ip:"192.168.1.14" },
    { id:"PC-E", ip:"192.168.1.15" },
    { id:"PC-F", ip:"192.168.1.16" },
    { id:"PC-G", ip:"192.168.1.50" },   // 競合
    { id:"PC-H", ip:"192.168.1.18" },
    { id:"PC-I", ip:"192.168.1.19" },
    { id:"PC-J", ip:"192.168.1.20" },
  ];
  M2.diag = false;
  M2.selected = null;
  M2.manualFixDone = false;
  M2.dhcpUsed = false;
  M2.cleared = false;

  M2.log.innerHTML = "";
  closeProp();

  const dhcpBtn = document.getElementById("dhcp-btn");
  dhcpBtn.disabled = true;

  const diagBtn = document.getElementById("diag-btn");
  diagBtn.setAttribute("aria-pressed", "false");
  diagBtn.innerHTML = '<span aria-hidden="true">🔍</span> 診断ツールを起動';
  document.getElementById("diag-hint").textContent = "診断ツールは停止中です。";
  M2.wrap.classList.remove("diag-on");

  buildLanGrid();
  m2Render();
  addLog(M2.log, "bad", "2台のパソコンで通信エラーが発生しています。診断ツールで原因を調べてください。");
}

/** LANマップのDOMを作る */
function buildLanGrid(){
  M2.grid.innerHTML = "";
  M2.pcs.forEach((pc) => {
    const node = document.createElement("div");
    node.className = "node";
    node.id = "node-" + pc.id;
    node.innerHTML = `
      <div class="node-line"></div>
      <div class="node-box" tabindex="0" role="button" aria-label="${pc.id} を調べる">
        <div class="node-face">🖥️</div>
        <div class="node-name">${pc.id}</div>
        <div class="node-ip"></div>
      </div>`;

    const box = node.querySelector(".node-box");
    box.addEventListener("click", () => onNodeClick(pc.id));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); box.click(); }
    });

    M2.grid.appendChild(node);
  });
}

/** 競合しているアドレスの一覧を返す */
function conflictedIps(){
  const count = {};
  M2.pcs.forEach((pc) => { count[pc.ip] = (count[pc.ip] || 0) + 1; });
  return Object.keys(count).filter((ip) => count[ip] > 1);
}

/** そのPCがエラー状態か */
function isErrorPc(pc){
  const parsed = parseIp(pc.ip);
  if (!parsed || parsed.net !== NETWORK) return true;
  if (parsed.host < HOST_MIN || parsed.host > HOST_MAX) return true;
  return conflictedIps().includes(pc.ip);
}

/** LANマップの表示を更新 */
function m2Render(){
  M2.pcs.forEach((pc) => {
    const node = document.getElementById("node-" + pc.id);
    const err  = isErrorPc(pc);
    node.classList.toggle("is-error", err);
    node.classList.toggle("is-selected", M2.selected === pc.id);
    node.querySelector(".node-ip").textContent = pc.ip;
    node.querySelector(".node-face").textContent = err ? "⚠️" : "🖥️";
  });
}

/** 診断ツールのON/OFF */
document.getElementById("diag-btn").addEventListener("click", () => {
  M2.diag = !M2.diag;
  const btn  = document.getElementById("diag-btn");
  const hint = document.getElementById("diag-hint");

  btn.setAttribute("aria-pressed", String(M2.diag));
  M2.wrap.classList.toggle("diag-on", M2.diag);

  if (M2.diag){
    btn.innerHTML = '<span aria-hidden="true">🔍</span> 診断ツールを停止';
    hint.textContent = "調べたいパソコンを押してください。";
    addLog(M2.log, "info", "診断ツールを起動しました。パソコンを押すと設定内容を確認できます。");
  } else {
    btn.innerHTML = '<span aria-hidden="true">🔍</span> 診断ツールを起動';
    hint.textContent = "診断ツールは停止中です。";
    closeProp();
    m2Render();
  }
});

/** マップ上のPCを押したとき */
function onNodeClick(pcId){
  if (!M2.diag){
    addLog(M2.log, "info", "まず「診断ツールを起動」を押してください。");
    return;
  }
  const pc = M2.pcs.find((p) => p.id === pcId);
  M2.selected = pcId;

  propEmpty.classList.add("is-hidden");
  propPanel.classList.remove("is-hidden");
  propTarget.textContent = `${pc.id} のネットワーク設定`;
  ipInput.value = pc.ip;
  propMsg.textContent = "";
  propMsg.className = "prop-msg";

  // 競合していれば相手を教える（原因発見のヒント）
  const rivals = M2.pcs.filter((p) => p.id !== pc.id && p.ip === pc.ip).map((p) => p.id);
  if (rivals.length){
    addLog(M2.log, "bad",
      `${pc.id} を調査：IPアドレスは ${pc.ip}。同じアドレスが ${rivals.join("・")} でも使われています。`);
    propMsg.textContent = `⚠️ ${rivals.join("・")} と同じアドレスです。どちらかを空いている番号に変えてください。`;
    propMsg.className = "prop-msg bad";
  } else {
    addLog(M2.log, "info", `${pc.id} を調査：IPアドレスは ${pc.ip}。異常はありません。`);
  }
  m2Render();
  ipInput.focus();
}

/** プロパティを閉じる */
function closeProp(){
  M2.selected = null;
  propPanel.classList.add("is-hidden");
  propEmpty.classList.remove("is-hidden");
  propTarget.textContent = "パソコンを選ぶと、ここに設定が出ます";
  m2Render();
}
document.getElementById("close-prop").addEventListener("click", closeProp);

/** 手動でIPアドレスを保存する */
document.getElementById("save-btn").addEventListener("click", () => {
  const pc = M2.pcs.find((p) => p.id === M2.selected);
  if (!pc) return;

  const value  = ipInput.value.trim();
  const parsed = parseIp(value);

  const fail = (msg) => {
    propMsg.textContent = msg;
    propMsg.className   = "prop-msg bad";
    addLog(M2.log, "bad", `${pc.id} の設定を保存できませんでした：${msg}`);
  };

  if (!parsed)                                  return fail("IPアドレスの形式が正しくありません（例：192.168.1.51）。");
  if (parsed.net !== NETWORK)                   return fail(`グループの番号が違います。${NETWORK}.× にしてください。`);
  if (parsed.host < HOST_MIN)                   return fail(`${ROUTER_IP} はルータが使用中です。別の番号にしてください。`);
  if (parsed.host > HOST_MAX)                   return fail("最後の数字は 2〜254 の範囲にしてください。");

  const taken = M2.pcs.some((p) => p.id !== pc.id && p.ip === parsed.text);
  if (taken)                                    return fail(`${parsed.text} は他のパソコンが使用中です。空いている番号にしてください。`);

  // 保存成功
  pc.ip = parsed.text;
  propMsg.textContent = "設定を保存しました。通信が復旧しました。";
  propMsg.className   = "prop-msg ok";
  addLog(M2.log, "ok", `${pc.id} のIPアドレスを ${parsed.text} に変更しました。エラーが解消され、ルータと通信できます。`);
  m2Render();

  // 初回の手動修正でDHCPを解禁する
  if (!M2.manualFixDone){
    M2.manualFixDone = true;
    const dhcpBtn = document.getElementById("dhcp-btn");
    dhcpBtn.disabled = false;
    addLog(M2.log, "info",
      "手動で直すのは大変ですね。ここで、全自動でアドレスを配ってくれる『DHCPサーバー』を起動してみましょう！");
  }

  checkM2Clear();
});

/* Enterキーでも保存できるように */
ipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    document.getElementById("save-btn").click();
  }
});

/** DHCPサーバー起動：ルータから全PCへパケットを飛ばして一括再設定 */
document.getElementById("dhcp-btn").addEventListener("click", () => {
  const btn = document.getElementById("dhcp-btn");
  if (btn.disabled) return;
  btn.disabled = true;

  closeProp();
  addLog(M2.log, "info", "DHCPサーバーを起動しました。全パソコンへアドレスを配布しています…");

  const router  = document.querySelector(".lan-router");
  const wrapBox = M2.wrap.getBoundingClientRect();
  const rBox    = router.getBoundingClientRect();
  const startX  = rBox.left - wrapBox.left + rBox.width / 2 - 6;
  const startY  = rBox.top  - wrapBox.top  + rBox.height / 2 - 6;

  // 各PCへ光の弾を飛ばす
  M2.pcs.forEach((pc, i) => {
    const target = document.getElementById("node-" + pc.id).getBoundingClientRect();
    const dx = target.left - wrapBox.left + target.width / 2 - 6 - startX;
    const dy = target.top  - wrapBox.top  + target.height / 2 - 6 - startY;

    const dot = document.createElement("div");
    dot.className = "packet";
    dot.style.left = startX + "px";
    dot.style.top  = startY + "px";
    M2.layer.appendChild(dot);

    setTimeout(() => {
      dot.style.transform = `translate(${dx}px, ${dy}px)`;
      dot.style.opacity   = "0.15";
    }, 60 * i + 30);

    setTimeout(() => dot.remove(), 60 * i + 900);
  });

  // 配布完了後にアドレスを一括再設定（192.168.1.2 〜 192.168.1.11）
  setTimeout(() => {
    M2.pcs.forEach((pc, i) => { pc.ip = `${NETWORK}.${HOST_MIN + i}`; });
    M2.dhcpUsed = true;
    m2Render();
    addLog(M2.log, "ok",
      "DHCPサーバーが10台すべてに重複しないアドレス（192.168.1.2〜192.168.1.11）を自動で配布しました。");
    checkM2Clear();
  }, 60 * M2.pcs.length + 850);
});

/** クリア判定 */
function checkM2Clear(){
  const allOk = M2.pcs.every((pc) => !isErrorPc(pc));
  if (!allOk) return;

  if (M2.cleared){
    // 既にクリア済み。DHCPを後から使った場合だけ追加で称える
    if (M2.dhcpUsed){
      showOverlay("完全自動化に成功！",
        "DHCPを使えば、1台ずつ手で設定しなくても重複のないアドレスを配れます。これが学校や会社のLANの仕組みです。");
    }
    return;
  }

  M2.cleared = true;
  addLog(M2.log, "ok", "🎉 10台すべてのエラーが解消しました。ネットワークは完全復旧です！");
  showOverlay("ミッションクリア！優れたエンジニアの誕生です！",
    M2.dhcpUsed
      ? "DHCPサーバーが全台に重複しないアドレスを自動で配りました。手作業との違いを体感できましたか？"
      : "IPアドレスの重複を見つけて直せました。「秘技：DHCPサーバー起動」で自動化も試してみましょう。");
}

document.getElementById("m2-reset").addEventListener("click", m2Init);


/* ------------------------------------------------------------------ */
/* 起動                                                                */
/* ------------------------------------------------------------------ */
m1Init();
m2Init();
