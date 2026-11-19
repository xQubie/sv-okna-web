(function () {
	'use strict';
	var P = window.SV_PRICES, C = window.SvCalc;
	if (!P || !C) return;
	var $ = function (id) { return document.getElementById(id); };
	var SASH_TYPES = ['Глухая', 'Поворотная', 'Поворотно-откидная', 'Откидная'];
	var GOUT = ['4', '4МФ', '4зак', '4мат'], GIN = ['4И', '4зак', '4мат'];
	var originalPictures = window.SV_PICT;
	var originalColors = window.PriceData.bundled.colors;
	function remapPictures(prices) {
		window.SV_PICT = {
			wood: prices.colors.map(function (row) {
				var index = originalColors.findIndex(function (original) { return original[0] === row[0]; });
				return originalPictures.wood[index] || '#FFF8E7';
			}),
			line: prices.colors.map(function (row) {
				var index = originalColors.findIndex(function (original) { return original[0] === row[0]; });
				return originalPictures.line[index] || '#808080';
			}),
			handles: originalPictures.handles
		};
	}
	remapPictures(P);
	var state = { type: 78, material: 'Сосна сращенная', cfg: 1, sashes: [], glass: '', gout: '4', gin: '4И', cin: 1, cout: 1, handle: 'Бронза', fanType: 0, fanH: 0 };

	function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }
	function opt(sel, items, val) {
		sel.innerHTML = '';
		items.forEach(function (it) {
			var o = document.createElement('option');
			o.value = it[0]; o.textContent = it[1];
			if (String(it[0]) === String(val)) o.selected = true;
			sel.appendChild(o);
		});
	}
	function glassLabel(g) {
		var two = (g.split('-').length - 1) > 2;
		var s = (two ? 'Двухкамерный ' : 'Однокамерный ') + state.gout + g.replace(/ /g, '') + state.gin;
		var x = [];
		if (g.indexOf('Ar') >= 0) x.push('аргон');
		if (g.indexOf('TSS') >= 0) x.push('тёплая рамка');
		return s + (x.length ? ' (' + x.join(', ') + ')' : '');
	}
	function setPressed(group, v) {
		[].forEach.call(group.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === String(v) ? 'true' : 'false'); });
	}
	function defaultSashes(n, old) {
		var res = [];
		for (var i = 0; i < n; i++) {
			var t = old && old[i] ? old[i].type : (n === 1 ? 0 : (i === n - 1 ? 2 : (i === 0 ? 2 : 0)));
			res.push({ type: t, left: old && old[i] ? old[i].left : (n > 1 && i === 0) });
		}
		if (!old && n === 2) { res[0] = { type: 2, left: true }; res[1] = { type: 1, left: false }; }
		return res;
	}

	function renderSashes() {
		var box = $('svc-sashes'); box.innerHTML = '';
		state.sashes.forEach(function (s, i) {
			var d = document.createElement('div'); d.className = 'svc__sashbox';
			var b = document.createElement('b'); b.textContent = 'Створка ' + (i + 1); d.appendChild(b);
			var l1 = document.createElement('label'); l1.textContent = 'Открывание';
			var s1 = document.createElement('select');
			opt(s1, SASH_TYPES.map(function (t, k) { return [k, t]; }), s.type);
			s1.addEventListener('change', function () { s.type = +s1.value; if (s.type === 3) s.left = true; renderSashes(); update(); });
			l1.appendChild(s1); d.appendChild(l1);
			if (s.type === 1 || s.type === 2) {
				var l2 = document.createElement('label'); l2.textContent = 'Петли';
				var s2 = document.createElement('select');
				opt(s2, [['1', 'Слева'], ['0', 'Справа']], s.left ? '1' : '0');
				s2.addEventListener('change', function () { s.left = s2.value === '1'; update(); });
				l2.appendChild(s2); d.appendChild(l2);
			}
			box.appendChild(d);
		});
	}

	function renderType() {
		setPressed($('svc-type'), state.type);
		var mats = C.MATERIALS_BY_TYPE[state.type];
		if (mats.indexOf(state.material) < 0) state.material = mats[0];
		opt($('svc-material'), mats.map(function (m) { return [m, m]; }), state.material);
		var gl = C.glassOptions(state.type);
		if (gl.indexOf(state.glass) < 0) state.glass = gl[0];
		opt($('svc-glass'), gl.map(function (g) { return [g, glassLabel(g)]; }), state.glass);
	}

	function draw(r) {
		var W = +$('svc-w').value || 1, H = +$('svc-h').value || 1;
		var PC = window.SV_PICT || {}, WOOD = (PC.wood || [])[state.cin - 1] || '#FFF8E6', LINE = (PC.line || [])[state.cin - 1] || '#808080', IRON = (PC.handles || {})[state.handle] || '#1E1E1E'; // цвета как в программе
		var k = Math.min(300 / W, 300 / H), w = W * k, h = H * k, f = Math.max(3, 55 * k); // всё в мм × масштаб
		var svg = '<svg viewBox="-4 -4 ' + (w + 8) + ' ' + (h + 8) + '" width="' + (w + 8) + '" height="' + (h + 8) + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Схема окна, ширина ' + W + ' мм, высота ' + H + ' мм">';
		svg += '<rect data-role="outer-frame" x="0" y="0" width="' + w + '" height="' + h + '" fill="' + WOOD + '" stroke="' + LINE + '" stroke-width="0.8"/><rect x="' + f + '" y="' + f + '" width="' + (w - 2 * f) + '" height="' + (h - 2 * f) + '" fill="' + WOOD + '" stroke="' + LINE + '" stroke-width="0.8"/>';
		var L = 'stroke="#6B5F35" stroke-width="1" stroke-dasharray="5 4"';
		// стиль чертежа как в программе: светлый брус, тонкие линии, стекло со штапиком, чёрные петли и ручки
		var GLASS = '#DFFAFC';
		function R(x, y, w, h, fill, sw) { return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(w, 0) + '" height="' + Math.max(h, 0) + '" fill="' + fill + '" stroke="' + LINE + '" stroke-width="' + (sw || 0.8) + '"/>'; }
		function glass(x, y, w, h, bb) { return R(x, y, w, h, WOOD) + R(x + bb, y + bb, w - 2 * bb, h - 2 * bb, GLASS); }
		function pane(x, y, cw, ch, type, left) { // type: 0 глухая, 1 П, 2 ПО, 3 О
			var s2 = '', b = Math.max(4, Math.min(58 * k, cw / 4, ch / 4)), bb = Math.max(1.5, b * 0.28), gx, gy, gw, gh;
			if (type) { // створка — коробка из бруса, внутри стекло со штапиком
				s2 += R(x, y, cw, ch, WOOD);
				s2 += glass(x + b, y + b, cw - 2 * b, ch - 2 * b, bb);
				gx = x + b + bb; gy = y + b + bb; gw = cw - 2 * (b + bb); gh = ch - 2 * (b + bb);
			} else {
				s2 += glass(x, y, cw, ch, bb);
				gx = x + bb; gy = y + bb; gw = cw - 2 * bb; gh = ch - 2 * bb;
			}
			var Ls = 'stroke="#5F6F70" stroke-width="0.7" fill="none"';
			if (type === 1 || type === 2) {
				var hx = left ? gx + gw : gx, ox = left ? gx : gx + gw;
				s2 += '<polyline points="' + ox + ',' + gy + ' ' + hx + ',' + (gy + gh / 2) + ' ' + ox + ',' + (gy + gh) + '" ' + Ls + '/>';
			}
			if (type === 2 || type === 3) s2 += '<polyline points="' + gx + ',' + (gy + gh) + ' ' + (gx + gw / 2) + ',' + gy + ' ' + (gx + gw) + ',' + (gy + gh) + '" ' + Ls + '/>';
			if (type) {
				// ручка с розеткой — как в программе (Drawing.vb subHandleDraw): розетка 66×30, рычаг 120×20, ось 30×20 мм
				var hS = '" fill="' + IRON + '" stroke="#5A5A5A" stroke-width="0.4"/>';
				var hr = function (rx0, ry0, rw, rh, rr) { return '<rect x="' + rx0 + '" y="' + ry0 + '" width="' + rw + '" height="' + rh + '" rx="' + rr + hS; };
				if (type === 3) { var hcx = x + cw / 2, hcy = y + 33 * k;
					s2 += hr(hcx - 33 * k, hcy - 15 * k, 66 * k, 30 * k, 15 * k) + hr(hcx - 10 * k, hcy - 10 * k, 120 * k, 20 * k, 10 * k) + hr(hcx - 10 * k, hcy - 10 * k, 30 * k, 20 * k, 10 * k); }
				else { var sh = ch / k, hh = sh < 467 ? 143 : sh < 697 ? 208 : sh < 877 ? 318 : sh < 1127 ? 418 : sh < 1377 ? 518 : sh < 1627 ? 618 : sh < 1737 ? 718 : sh < 2136 ? sh / 2 : 1068; // getHandleHeight
					var hcx = left ? x + cw - 33 * k : x + 33 * k, hcy = Math.max(y + 40 * k, Math.min(y + ch - hh * k, y + ch - 115 * k));
					s2 += hr(hcx - 15 * k, hcy - 33 * k, 30 * k, 66 * k, 15 * k) + hr(hcx - 10 * k, hcy - 10 * k, 20 * k, 120 * k, 10 * k) + hr(hcx - 10 * k, hcy - 10 * k, 20 * k, 30 * k, 10 * k); }
				// петли — как в программе: снаружи створки, на стыке с рамой, у верхнего и нижнего края
				var pw = 15 * k, pl = 100 * k; // петли: 15×100 мм в масштабе окна
				if (type === 3) [x + 1, x + cw - pl - 1].forEach(function (px) { s2 += '<rect x="' + px + '" y="' + (y + ch + 0.5) + '" width="' + pl + '" height="' + pw + '" rx="0.8" fill="' + IRON + '" stroke="#5A5A5A" stroke-width="0.4"/>'; });
				else { var hx0 = left ? x - pw - 0.5 : x + cw + 0.5; [y + 1, y + ch - pl - 1].forEach(function (py) { s2 += '<rect x="' + hx0 + '" y="' + py + '" width="' + pw + '" height="' + pl + '" rx="0.8" fill="' + IRON + '" stroke="#5A5A5A" stroke-width="0.4"/>'; }); }
			}
			return s2;
		}
		var fan = r && r.fan ? r.fan.type : 0, yTop = f;
		var sw = r ? r.sashWidths : [], inner = w - 2 * f, total = sw.reduce(function (a, b) { return a + b; }, 0) || 1;
		var xs = [], x = f;
		var gap = Math.max(3, 80 * k), avail = inner - gap * (state.sashes.length - 1);
		state.sashes.forEach(function (s, i) { var cw = avail * (sw[i] || 1) / total; xs.push([x, cw]); x += cw + gap; });
		// наплав створки 25 мм (на импост — не больше, чем позволяет ширина импоста)
		var OV = 25 * k, half = Math.max(0, (gap - 10 * k) / 2), one = Math.max(0, gap - 10 * k);
		var gapH = Math.max(3, 80 * k), halfH = Math.max(0, (gapH - 10 * k) / 2); // горизонтальный импост под фрамугой шире — место для петель
		var ovH = function (open, nb) { return !open ? 0 : Math.min(OV, nb ? halfH : gapH - 10 * k); };
		var ov = function (open, nb) { return !open ? 0 : nb === undefined ? OV : Math.min(OV, nb ? half : one); };
		var P2 = function (x0, y0, w0, h0, tp, lf, l, t, rr, bb) { return pane(x0 - l, y0 - t, w0 + l + rr, h0 + t + bb, tp, lf); };
		var mainOpen = state.sashes.some(function (s) { return s.type; }), fanOpen = fan === 2 || fan === 4, last = state.sashes.length - 1;
		if (fan) {
			var yc = r.fan.yc * k, fh = Math.max(yc - f - gapH / 2, 4);
			if (fan <= 2) svg += P2(f, f, inner, fh, fan === 2 ? 3 : 0, true, ov(fanOpen), ov(fanOpen), ov(fanOpen), ovH(fanOpen, mainOpen));
			else xs.forEach(function (p, i) { svg += P2(p[0], f, p[1], fh, fan === 4 ? 3 : 0, true, i ? ov(fanOpen, fanOpen) : ov(fanOpen), ov(fanOpen), i < last ? ov(fanOpen, fanOpen) : ov(fanOpen), ovH(fanOpen, !!state.sashes[i].type)); });
			yTop = yc + gapH / 2;
		}
		var ch = h - f - yTop;
		state.sashes.forEach(function (s, i) { var o = !!s.type;
			svg += P2(xs[i][0], yTop, xs[i][1], ch, s.type, s.left, i ? ov(o, !!state.sashes[i - 1].type) : ov(o), fan ? ovH(o, fanOpen) : ov(o), i < last ? ov(o, !!state.sashes[i + 1].type) : ov(o), ov(o)); });
		svg += '</svg>';
		$('svc-draw').innerHTML = svg;
	}

	function renderFan(W, H) {
		if (!$('svc-fan')) return;
		var r0 = C.calc({ type: state.type, material: state.material, width: W, height: H, sashes: state.sashes, colorIn: 1, colorOut: 1,
			glass: state.glass, glassOut: state.gout, glassIn: state.gin, handleColor: state.handle, quant: 1 }, P);
		var fo = C.fanOptions(state.type, W, H, state.sashes.map(function (s) { return s.type; }), r0.sashWidths);
		if (fo.types.indexOf(state.fanType) < 0) state.fanType = 0;
		opt($('svc-fan'), fo.types.map(function (t) { return [t, C.FAN_TYPES[t]]; }), state.fanType);
		var hs = fo.heights(state.fanType), hSel = $('svc-fanh');
		if (!state.fanType || !hs.length) { hSel.innerHTML = ''; hSel.disabled = true; state.fanH = 0; if (state.fanType && !hs.length) { state.fanType = 0; $('svc-fan').value = 0; } return; }
		if (hs.indexOf(state.fanH) < 0) {
			var d = fo.defHeight(state.fanType), best = hs[0];
			hs.forEach(function (v) { if (Math.abs(v - d) < Math.abs(best - d)) best = v; });
			state.fanH = best;
		}
		hSel.disabled = false;
		opt(hSel, hs.map(function (v) { return [v, v + ' мм']; }), state.fanH);
	}

	// заказ для серверного пересчёта (/calc/api.php) и будущей корзины
	window.svCalcOrder = function () { return { type: state.type, material: state.material, width: +$('svc-w').value, height: +$('svc-h').value, sashes: state.sashes.map(function (s) { return { type: s.type, left: !!s.left }; }), fan: { type: state.fanType, height: state.fanH }, colorIn: state.cin, colorOut: state.cout, glass: state.glass, glassOut: state.gout, glassIn: state.gin, handleColor: state.handle, quant: Math.max(1, +$('svc-q').value || 1), mnt: state.mnt || 0, dem: state.dem || 0 }; };
	function update() {
		var W = +$('svc-w').value, H = +$('svc-h').value, Q = Math.max(1, +$('svc-q').value || 1);
		var okSize = W >= 400 && W <= 4200 && H >= 400 && H <= 4200;
		var maxCfg = okSize ? C.allowedConfigs(state.type, W) : 4;
		[].forEach.call($('svc-cfg').querySelectorAll('button'), function (b) { b.disabled = +b.dataset.v > maxCfg; });
		if (state.cfg > maxCfg) { state.cfg = maxCfg; state.sashes = defaultSashes(state.cfg, state.sashes.slice(0, state.cfg)); renderSashes(); }
		setPressed($('svc-cfg'), state.cfg);
		var warn = [];
		if (!(W >= 400 && W <= 4200) || !(H >= 400 && H <= 4200)) {
			$('svc-one').textContent = '—'; $('svc-total').textContent = ''; $('svc-info').textContent = ''; if ($('svc-bar-price')) $('svc-bar-price').textContent = '—';
			$('svc-warn').innerHTML = '<div class="svc__warn">Ширина и высота — от 400 до 4200 мм.</div>'; if (withMnt) $('svc-mntres').hidden = true;
			$('svc-draw').innerHTML = ''; $('svc-draw').style.display = 'none'; return;
		}
		renderFan(W, H);
		var r = C.calc({ type: state.type, material: state.material, width: W, height: H, sashes: state.sashes, fan: { type: state.fanType, height: state.fanH },
			colorIn: state.cin, colorOut: state.cout, glass: state.glass, glassOut: state.gout, glassIn: state.gin,
			handleColor: state.handle, quant: Q, profileColor: state.cout === 1 ? 0 : (P.colors[state.cout - 1][3] === 0 ? 1 : 2) }, P);
		$('svc-one').textContent = fmt(r.one);
		if ($('svc-bar-price')) $('svc-bar-price').textContent = Q > 1 ? fmt(r.total) : fmt(r.one);
		$('svc-total').textContent = Q > 1 ? 'Итого за ' + Q + ' шт: ' + fmt(r.total) : '';
		if (withMnt) {
			var mt = montage(W, H), box = $('svc-mntres'), html = '';
			$('svc-dem').disabled = !state.mnt;
			if (mt.m) {
				if (Q > 1) $('svc-total').textContent = 'Окна за ' + Q + ' шт: ' + fmt(r.total);
				html += '<span>' + MNT_NAMES[state.mnt] + ': ' + fmt(mt.m * Q) + '</span>';
				if (mt.d) html += '<span>' + DEM_NAMES[state.dem] + ': ' + fmt(mt.d * Q) + '</span>';
				html += '<b>Итого с монтажом' + (Q > 1 ? ' за ' + Q + ' шт' : '') + ': ' + fmt(r.total + (mt.m + mt.d) * Q) + '</b>';
				html += '<small>Монтаж — без доставки, подъёма на этаж и выезда за пределы города. Минимальная стоимость монтажа на заказ — 8 000 ₽.</small>';
				if ($('svc-bar-price')) $('svc-bar-price').textContent = fmt(r.total + (mt.m + mt.d) * Q);
			}
			box.innerHTML = html; box.hidden = !html;
		}
		$('svc-info').textContent = 'Площадь ' + r.square.toLocaleString('ru-RU') + ' м² · ' + Math.round(r.one / r.square).toLocaleString('ru-RU') + ' ₽/м²';
		// Sash dimensions do not restrict estimates in the mobile calculator.
		$('svc-warn').replaceChildren();
		$('svc-draw').style.display = ''; draw(r);
	}


	// монтаж / демонтаж (как в программе: objWin.MontagePrice)
	var MNTG = 1600, MNT_NAMES = ['Нет', 'Монтаж окон', 'Монтаж по технологии ILLBRUCK'],
		DEM_NAMES = ['Нет', 'Демонтаж', 'Вырезка и укрепление проёма', 'Сложный демонтаж'], DEM_K = [0, 0.25, 0.6, 0.4];
	var withMnt = ($('svc') && $('svc').getAttribute('data-montage')) !== '0';
	state.mnt = 0; state.dem = 0;
	function vbRound2(x) { var y = x * 100, f = Math.floor(y); if (Math.abs(y - f - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / 100; return Math.round(y) / 100; }
	function ceil100(x) { return Math.ceil(x / 100 - 1e-9) * 100; }
	function montage(W, H) {
		var S = vbRound2(W * H / 1e6), k = P.coeff * MNTG * S, m = 0, d = 0;
		if (state.mnt) {
			m = ceil100(k * (state.type === 78 ? 1 : 0.85) * (state.mnt === 2 ? 1.5 : 0.8) * (S > 3 ? 1.5 : 1));
			if (state.dem) d = ceil100(k * DEM_K[state.dem]);
		}
		return { m: m, d: d };
	}
	(function () {
		var ff = document.createElement('fieldset'); ff.id = 'svc-fanbox';
		ff.innerHTML = '<legend>Фрамуга</legend><div class="svc__row"><label>Фрамуга сверху<select id="svc-fan"></select></label><label>Высота фрамуги<select id="svc-fanh"></select></label></div>';
		var sashFs = $('svc-sashes').closest('fieldset');
		sashFs.parentNode.insertBefore(ff, sashFs); // фрамуга над створками
	})();
	if (withMnt) {
		var fs = document.createElement('fieldset'); fs.id = 'svc-mnt';
		fs.innerHTML = '<legend>Монтаж</legend><div class="svc__row"><label>Монтаж<select id="svc-mont"></select></label><label>Демонтаж<select id="svc-dem"></select></label></div>';
		document.querySelector('.svc__form').appendChild(fs);
		var mr = document.createElement('div'); mr.id = 'svc-mntres'; mr.className = 'svc__mnt';
		$('svc-total').parentNode.insertBefore(mr, $('svc-total').nextSibling);
	}

	// инициализация
	opt($('svc-gout'), P.glassOut.filter(function (g) { return GOUT.indexOf(g[0]) >= 0; }).map(function (g) { return [g[0], g[1].replace(/\.$/, '')]; }), state.gout);
	opt($('svc-gin'), P.glassIn.filter(function (g) { return GIN.indexOf(g[0]) >= 0; }).map(function (g) { return [g[0], g[1].replace(/\.$/, '')]; }), state.gin);
	var colors = P.colors.map(function (c, i) { return [i + 1, c[0]]; });
	opt($('svc-cin'), colors, state.cin); opt($('svc-cout'), colors, state.cout);
	opt($('svc-handle'), C.HANDLE_COLORS.filter(function (h) { return h !== 'Шампань'; }).map(function (h) { return [h, h]; }), state.handle);
	state.sashes = defaultSashes(state.cfg);
	renderType(); renderSashes(); update();

	$('svc-type').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; state.type = +b.dataset.v; renderType(); update(); });
	$('svc-cfg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b || b.disabled) return; state.cfg = +b.dataset.v; state.sashes = defaultSashes(state.cfg); renderSashes(); update(); });
	$('svc-material').addEventListener('change', function (e) { state.material = e.target.value; update(); });
	$('svc-glass').addEventListener('change', function (e) { state.glass = e.target.value; update(); });
	$('svc-gout').addEventListener('change', function (e) { state.gout = e.target.value; renderType(); update(); });
	$('svc-gin').addEventListener('change', function (e) { state.gin = e.target.value; renderType(); update(); });
	$('svc-cin').addEventListener('change', function (e) { var v = +e.target.value; if (state.cout === state.cin) { state.cout = v; $('svc-cout').value = v; } state.cin = v; update(); });
	$('svc-cout').addEventListener('change', function (e) { state.cout = +e.target.value; update(); });
	$('svc-handle').addEventListener('change', function (e) { state.handle = e.target.value; update(); });
	['svc-w', 'svc-h', 'svc-q'].forEach(function (id) { $(id).addEventListener('input', update); });
	$('svc-fan').addEventListener('change', function (e) { state.fanType = +e.target.value; state.fanH = 0; update(); });
	$('svc-fanh').addEventListener('change', function (e) { state.fanH = +e.target.value; update(); });
	if (withMnt) {
		opt($('svc-mont'), MNT_NAMES.map(function (t, i) { return [i, t]; }), 0);
		opt($('svc-dem'), DEM_NAMES.map(function (t, i) { return [i, t]; }), 0);
		$('svc-mont').addEventListener('change', function (e) { state.mnt = +e.target.value; if (!state.mnt) { state.dem = 0; $('svc-dem').value = 0; } update(); });
		$('svc-dem').addEventListener('change', function (e) { state.dem = +e.target.value; update(); });
		update();
	}
	var bar = document.querySelector('.svc__bar'), res = document.querySelector('.svc__res');
	if (bar && res) {
		bar.addEventListener('click', function (e) {
			e.preventDefault();
			var y = res.getBoundingClientRect().top + window.pageYOffset - 12;
			try { window.scrollTo({ top: y, behavior: 'smooth' }); } catch (x) { window.scrollTo(0, y); }
		});
		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (en) { bar.classList.toggle('is-hidden', en[0].isIntersecting); }).observe(res);
		}
	}
	// Mobile integration: restore a configuration and return one calculated item.
	window.formatSetWindow = function (order) {
		state.type = order.type; state.material = order.material;
		state.sashes = order.sashes.map(function (s) { return {type:s.type,left:s.left}; });
		state.cfg = state.sashes.length; state.glass = order.glass;
		state.gout = order.glassOut; state.gin = order.glassIn;
		state.cin = order.colorIn; state.cout = order.colorOut; state.handle = order.handleColor;
		state.fanType = order.fan.type; state.fanH = order.fan.height;
		state.mnt = order.mnt; state.dem = order.dem;
		var fields = {w:order.width,h:order.height,q:order.quant,gout:state.gout,gin:state.gin,
			cin:state.cin,cout:state.cout,handle:state.handle,mont:state.mnt,dem:state.dem};
		Object.keys(fields).forEach(function (key) { $('svc-' + key).value = fields[key]; });
		renderType(); renderSashes(); update();
	};
	window.formatGetWindow = function () {
		var o = window.svCalcOrder();
		o.profileColor = o.colorOut === 1 ? 0 : (P.colors[o.colorOut - 1][3] === 0 ? 1 : 2);
		var result = C.calc(o, P), labor = montage(o.width, o.height);
		return { config: o, one: result.one, goods: result.total, mount: labor.m * o.quant, demo: labor.d * o.quant,
			svg: $('svc-draw').innerHTML, warnings: result.warnings, finish: P.colors[o.colorIn - 1][0] + ' / ' + P.colors[o.colorOut - 1][0] };
	};

	window.formatUpdatePrices = function (prices, config) {
		P = prices;
		window.SV_PRICES = prices;
		var old = config || window.svCalcOrder();
        remapPictures(P);
		var colors = P.colors.map(function (c, i) { return [i + 1, c[0]]; });
		opt($('svc-cin'), colors, old.colorIn);
		opt($('svc-cout'), colors, old.colorOut);
		window.formatSetWindow(old);
	};})();



