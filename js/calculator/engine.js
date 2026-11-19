/*
 * Расчёт цены прямоугольного окна — перенос свойства objWin.Price из программы
 * «СВ Окна. Проектирование» (VB.NET) для частного случая:
 * прямоугольник, верхняя фрамуга (нет / глухая / открывная / глухая раздельная / открывная раздельная),
 * 1–4 створки в ряд, створки Г/П/ПО/О,
 * без раскладки, без москитных сеток и микропроветривания, петли MACO,
 * обычная ручка, порог/профиль по умолчанию, без монтажа.
 */
(function (root) {
	'use strict';
	var OSV = 70, EURO = 78, D_TIMBER = 15, WOOD_P = 100000, MIN_BLANK = 200, MIN_SASH_HEIGHT = 240;
	var MATERIALS = ['Сосна сращенная', 'Сосна цельноламельная', 'Лиственница сращенная', 'Лиственница цельноламельная', 'Дуб цельноламельный', 'Липа'];
	var MATERIALS_BY_TYPE = {
		78: ['Сосна сращенная', 'Сосна цельноламельная', 'Лиственница сращенная', 'Лиственница цельноламельная', 'Дуб цельноламельный'],
		70: ['Сосна сращенная', 'Липа']
	};
	var HANDLE_COLORS = ['Белый', 'Коричневый', 'Бронза', 'Серебро', 'Титан', 'Шампань'];

	// VB.NET: присваивание дробного значения целому (Long/Integer) — банковское округление
	function rnd(x) {
		var f = Math.floor(x), d = x - f;
		if (Math.abs(d - 0.5) < 1e-9) return (f % 2 === 0) ? f : f + 1;
		return Math.round(x);
	}
	function M(mm) { return rnd(mm) / 1000; }                 // M(Integer)
	function idx(arr, v) { var i = arr.indexOf(v); return i; }   // ArrPosition(…, -1)
	function choose(i, list) { return list[i - 1]; }             // VB Choose (1-based)

	function glassOptions(timber) {
		// только стекла 4 мм (как по умолчанию в программе)
		if (timber === EURO) return ['-14-4-14-', '-14Ar-4-14Ar-', '-14TSS-4-14TSS-', '-14TSS Ar-4-14TSS Ar-'];
		return ['-20-', '-20Ar-', '-20TSS-', '-20TSS Ar-', '-8-4-8-', '-8Ar-4-8Ar-'];
	}
	function instrCnt(s, sub) { return s.split(sub).length - 1; }

	function allowedConfigs(timber, width) {
		if (width < MIN_BLANK * 2 + timber * 3) return 1;
		if (width < MIN_BLANK * 3 + timber * 4) return 2;
		if (width < MIN_BLANK * 4 + timber * 5) return 3;
		return 4;
	}
	function sashCheck(h, w) { // objWin.funSashCheck
		if (h < MIN_SASH_HEIGHT || w < MIN_SASH_HEIGHT) return false;
		if (h < 700 && w < 700) return true;
		return (h < 871 && w < h * 1.58 - 74) || (h > 870 && h < 1801 && w < 1300) || (h > 1800 && h < 2500 && w < 2108 - h * 0.45);
	}

	/**
	 * o: {type:78|70, material, width, height, sashes:[{type:0..3, left:bool}], colorIn, colorOut (1-based),
	 *     glass, glassOut, glassIn, handleColor, quant}
	 */
	function calc(o, P) {
		var T = o.type, euro = T === EURO, TH = euro ? 78 : 60;
		var W = o.width | 0, H = o.height | 0, cfg = o.sashes.length;
		var st = [0], dir = [false];
		for (var s = 0; s < cfg; s++) { st.push(o.sashes[s].type); dir.push(o.sashes[s].type === 3 ? true : !!o.sashes[s].left); }
		st.push(0); dir.push(false);
		var fan = o.fan && o.fan.type ? o.fan.type | 0 : 0, fanOpen = fan === 2 || fan === 4;
		var blankDown = st.slice(1, cfg + 1).every(function (t) { return t === 0; });
		var imp0 = fan ? T + D_TIMBER * ((fanOpen ? 1 : 0) * (blankDown ? (euro ? 0 : 1) : (euro ? 1 : 3))) : 0;
		var h0 = fan ? (o.fan.height | 0) : 0;
		var Yc = fan ? T + h0 + imp0 / 2 : 0;      // ось горизонтального импоста
		var HL = H - Yc;                           // высота нижней части (по осям)

		// --- импосты и ширины створок (subChangeWidth) ---
		var imp = [0, 0, 0, 0, 0];
		for (var i = 1; i <= cfg - 1; i++) {
			var a = st[i], b = st[i + 1];
			var v = T + D_TIMBER * ((a + b) === 0 ? 0 : 1) * (a * b === 0 ? (dir[i + 1] ? 1 : (!dir[i] ? ((a === 0 || a === 3 || a === 6) ? 0 : 1) : 0)) : 2);
			if (fan === 4 && v < T + D_TIMBER * (euro ? 1 : 2)) v = T + D_TIMBER * (euro ? 1 : 2);
			if (!dir[i] && dir[i + 1] && b !== 0 && b !== 3 && a !== 0 && a !== 3) v += D_TIMBER * (euro ? 1 : 2);
			if (!euro && b !== 0 && b !== 3 && a !== 0 && a !== 3 && dir[i] === dir[i + 1]) v += D_TIMBER;
			imp[i] = v;
		}
		if (cfg === 3 && euro && imp[1] !== imp[2] && imp[1] !== 56 && imp[2] !== 56) { imp[1] = Math.max(imp[1], imp[2]); imp[2] = imp[1]; }
		var sw = [0, 0, 0, 0, 0];
		sw[1] = Math.trunc((W - T * 2 - imp[1] - imp[2] - imp[3]) / cfg);
		if (cfg === 2) sw[2] = sw[1];
		if (cfg === 3) { sw[3] = sw[1]; sw[2] = sw[1]; }
		if (cfg === 4) { sw[4] = sw[1]; sw[3] = sw[1]; sw[2] = sw[1]; }
		// в программе остаток от деления уходит во 2-ю створку при последующем пересчёте; на цену влияет в пределах 1–3 мм
		function impX(k) {
			if (k <= 0) return 0;
			if (k >= cfg) return W;
			var x = T;
			for (var j = 1; j < k; j++) x += sw[j] + imp[j];
			return x + sw[k] + imp[k] / 2;
		}

		// --- qTimber ---
		var LTmb = 0, QTmb = 0;
		function shape(w, h) { // ShapeParameters для прямоугольника: n += 4; P += M(perimeter)
			QTmb = rnd(QTmb + 4);
			LTmb += M(rnd(w) * 2 + rnd(h) * 2);
		}
		shape(W, H);
		var cells = [];
		for (i = 1; i <= cfg; i++) cells.push(impX(i) - impX(i - 1));
		if (fan) {
			var k0 = imp0 > T ? 1.5 : 1;
			LTmb += M(W * k0); QTmb = rnd(QTmb + k0);                 // горизонтальный импост
			if (fan === 2) shape(W, Yc);
			if (fan >= 3) {
				for (i = 1; i <= cfg; i++) {
					if (imp[i] > 0 && !(imp[i] < 60 && fan === 4)) { var kf = imp[i] > T ? 1.5 : 1; LTmb += M(Yc * kf); QTmb = rnd(QTmb + kf); }
					if (fan === 4) shape(cells[i - 1], Yc);
				}
			}
		}
		for (i = 1; i <= cfg; i++) {
			if (imp[i] > 60) {
				var k = imp[i] > T ? 1.5 : 1;
				LTmb += M((fan ? HL : H) * k);
				QTmb = rnd(QTmb + k);
			}
			if (st[i] >= 1 && st[i] <= 3) shape(cells[i - 1], fan ? HL : H);
		}
		var HD = fan ? HL : H;

		// --- qGlass (Filling) ---
		var SqrGP = 0, Lgp = 0, Qgp = 0, Lfp = 0;
		function fill(w1, h1) {
			var sq = Math.max(w1 * h1 / 1e6, 0.6);
			SqrGP += sq * (sq < 3 ? 1 : (sq < 5 ? 1.2 : 1.5));
			Lgp += M(rnd(w1) * 2 + rnd(h1) * 2);
			Qgp = rnd(Qgp + 4);
			Lfp += Math.max(0.6, M(w1));
		}
		if (fan === 1 || fan === 2) fill(W, Yc);
		if (fan >= 3) for (i = 1; i <= cfg; i++) fill(cells[i - 1], Yc);
		for (i = 1; i <= cfg; i++) fill(cells[i - 1], HD);

		// --- qSashes ---
		var SqrSwing = 0, SqrFlap = 0, Lprof = 0, nHandles = 0;
		if (fan === 2) { SqrFlap += Math.max(W * Yc / 1e6, 0.6); nHandles += 1; Lprof += Math.max(0.6, M(W)); }
		if (fan === 4) for (i = 1; i <= cfg; i++) { SqrFlap += Math.max(cells[i - 1] * Yc / 1e6, 0.6); nHandles += 1; Lprof += Math.max(0.6, M(cells[i - 1])); }
		for (i = 1; i <= cfg; i++) {
			if (st[i] < 1 || st[i] > 3) continue;
			var w2 = cells[i - 1], sq2 = Math.max(w2 * HD / 1e6, 0.6);
			nHandles += 1;
			if (st[i] === 2 || st[i] === 3) SqrFlap += sq2; else SqrSwing += sq2;
			Lprof += Math.max(0.6, M(w2));
		}

		// --- Price ---
		var matsT = MATERIALS_BY_TYPE[T], mT = idx(matsT, o.material), mG = idx(MATERIALS, o.material);
		var price = 0;
		function add(x) { price = rnd(price + x); }
		var wdK = choose(mG + 1, [1, 1.3, 1.3, 1.8, (TH < 60 ? 3.7 : 2.2), 1.3]);
		price = rnd(1e-9 * TH * T * rnd(LTmb * 1000) * WOOD_P * wdK);                                   // WdPrc
		add(QTmb * (euro ? 1 : 0.6) * 100 * choose(mT + 1, [1, 1.3, 1.3, 1.6, 2.2]));                  // соединения
		add(SqrGP * 3100);                                                                               // GP_S
		add(Lgp * 200);                                                                                  // GP_L
		add(Qgp * 150 * 1);                                                                              // GP_Q, штапик «Софтлайн»
		add((SqrSwing + SqrFlap * 1.3) * 4000);                                                          // FURN_S
		var ci = o.colorIn, co = o.colorOut, C = P.colors;
		if (ci > 1 || co > 1) {
			var pK = choose(mG + 1, [1, 1, 1.5, 1.5, 2, 1.3]);
			var wPaint = M(T * 2 + TH * 2);
			add(wPaint * LTmb * C[ci - 1][2] * pK * 0.7);
			add(wPaint * LTmb * C[co - 1][2] * pK * 0.3);
			if (ci !== co) add(((C[ci - 1][1] + C[co - 1][1]) === 0 ? 3 : 1) * LTmb * 300);
		}
		// ручки: тип 1 (обычная), цвет по выбору
		var hPos = Math.max(0, HANDLE_COLORS.indexOf(o.handleColor));
		var hRow = P.handles.filter(function (r) { return r[0] === 10 + hPos; })[0] || P.handles[0];
		add(hRow[2] * nHandles);
		// петли MACO: P.hinges[0] (цена 0) — ничего не добавляют
		var prof = P.profile[o.profileColor || 0] || P.profile[0]; // цвет отлива/FP: программа ставит белый или коричневый по цвету снаружи
		if (euro) add(Lfp * prof[2] * 1);                                                               // ProfileFP (у ОСВ выключен)
		add(Lprof * (euro ? prof[1] : prof[3]));                                                         // отлив створок
		var gOut = P.glassOut.filter(function (r) { return r[0] === o.glassOut; })[0] || P.glassOut[0];
		var gIn = P.glassIn.filter(function (r) { return r[0] === o.glassIn; })[0] || P.glassIn[0];
		add(SqrGP * gOut[2]);
		add(SqrGP * gIn[2]);
		var g = o.glass;
		add(SqrGP * (instrCnt(g, 'TSS') * 330 + instrCnt(g, 'Ar') * 100 + (instrCnt(g, '-') - 3) * 700 + instrCnt(g, '-6-') * 660));

		var one = Math.ceil(price * P.coeff / 100) * 100;
		var warnings = [];
		for (i = 1; i <= cfg; i++) {
			if (st[i] === 0) { if (sw[i] < MIN_BLANK) warnings.push('Створка ' + i + ' слишком узкая.'); continue; }
			if (!sashCheck(H - T * 2 - imp0 - h0, sw[i])) warnings.push('Створка ' + i + ' слишком большая для открывания — увеличьте число створок или сделайте её глухой.');
		}
		if (fan === 2 && !sashCheck(W - T * 2, h0)) warnings.push('Фрамуга слишком большая для открывания — сделайте её глухой или раздельной.');
		if (fan === 4) for (i = 1; i <= cfg; i++) if (!sashCheck(sw[i], h0)) { warnings.push('Фрамуга над створкой ' + i + ' слишком большая для открывания.'); break; }
		return { fan: { type: fan, height: h0, imp: imp0, yc: Yc }, one: one, total: one * (o.quant || 1), square: Math.round(W * H / 1e4) / 100, sashWidths: sw.slice(1, cfg + 1), warnings: warnings,
			debug: { LTmb: LTmb, QTmb: QTmb, SqrGP: SqrGP, Lgp: Lgp, Qgp: Qgp, Lfp: Lfp, SqrSwing: SqrSwing, SqrFlap: SqrFlap, Lprof: Lprof, imp: imp, raw: price } };
	}

	/** Доступные типы фрамуги и высоты (objWin.FanTypes / FanHeights). sashTypes — типы створок 1..cfg, sw — ширины створок. */
	function fanOptions(T, W, H, sashTypes, sw) {
		var cfg = sashTypes.length, blankDown = sashTypes.every(function (t) { return t === 0; }), euro = T === EURO;
		var types = [0], downMin = blankDown ? MIN_BLANK : MIN_SASH_HEIGHT;
		if (H - T * 3 - downMin > MIN_BLANK) { types.push(1); if (cfg > 1) types.push(3); }
		var hOk = H - T * 3 - (T > OSV ? 0 : D_TIMBER) - downMin > MIN_SASH_HEIGHT;
		if (sashCheck(W - T * 2, MIN_SASH_HEIGHT) && hOk) types.push(2);
		if (cfg > 1 && hOk && sw.every(function (w) { return sashCheck(w, MIN_SASH_HEIGHT); })) types.push(4);
		types.sort();
		function heights(fan) {
			if (!fan) return [];
			var open = fan === 2 || fan === 4, min = open ? Math.ceil(MIN_SASH_HEIGHT / 100) * 100 : MIN_BLANK;
			var max = Math.trunc((H - T * 3 - D_TIMBER * (open ? 1 : 0) * (blankDown ? (euro ? 0 : 1) : (euro ? 1 : 3)) - downMin) / 50) * 50;
			var r = []; for (var h = min; h <= max; h += 50) r.push(h); return r;
		}
		function defHeight(fan) { var h = rnd((H - T * 3) / 150) * 50; if ((fan === 2 || fan === 4) && h < MIN_SASH_HEIGHT) h = MIN_SASH_HEIGHT; return h; }
		return { types: types, heights: heights, defHeight: defHeight };
	}

	root.SvCalc = { calc: calc, fanOptions: fanOptions, FAN_TYPES: ['Нет', 'Глухая', 'Открывная', 'Глухая раздельная', 'Открывная раздельная'], glassOptions: glassOptions, allowedConfigs: allowedConfigs, MATERIALS_BY_TYPE: MATERIALS_BY_TYPE, HANDLE_COLORS: HANDLE_COLORS, EURO: EURO, OSV: OSV };
})(typeof window !== 'undefined' ? window : globalThis);
