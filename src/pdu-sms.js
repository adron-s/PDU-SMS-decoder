"use strict";

/* декодер PDU формата SMS-ок получаемых AT командами с модема.
	 так же умеет кодировать обрабно в PDU формат.
	 смотри ./docs/	и https://github.com/tladesignz/jsPduDecoder
*/

/* строковые дамп функции. используются для отладки. */
function buf2hex8(buffer){
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16).toUpperCase()).slice(-2));
}
function buf2hex16(buffer){
  return Array.prototype.map.call(new Uint16Array(buffer), x => ('0000' + x.toString(16).toUpperCase()).slice(-4));
}

/* набор символов gsm7 кодировки */
const gsm7_charsets = {
	0: '@', 1: '£', 2: '$', 3: '¥', 4: 'è', 5: 'é', 6: 'ù', 7: 'ì', 8: 'ò', 9: 'Ç',
	10:'\n', 11: 'Ø', 12: 'ø', 13: '\r', 14: 'Å', 15: 'å', 16: '\u0394', 17: '_', 18: '\u03a6', 19: '\u0393',
	20: '\u039b', 21: '\u03a9', 22: '\u03a0', 23: '\u03a8', 24: '\u03a3', 25: '\u0398', 26: '\u039e', 28: 'Æ', 29: 'æ',
	30: 'ß', 31: 'É', 32: ' ', 33: '!', 34: '"', 35: '#', 36: '¤', 37: '%', 38: '&', 39: '\'',
	40: '(', 41: ')', 42: '*', 43: '+', 44: ',', 45: '-', 46: '.', 47: '/', 48: '0', 49: '1',
	50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9', 58: ':', 59: ';',
	60: '<', 61: '=', 62: '>', 63: '?', 64: '¡', 65: 'A', 66: 'B', 67: 'C', 68: 'D', 69: 'E',
	70: 'F', 71: 'G', 72: 'H', 73: 'I', 74: 'J', 75: 'K', 76: 'L', 77: 'M', 78: 'N', 79: 'O',
	80: 'P', 81: 'Q', 82: 'R', 83: 'S', 84: 'T', 85: 'U', 86: 'V', 87: 'W', 88: 'X', 89: 'Y',
	90: 'Z', 91: 'Ä', 92: 'Ö', 93: 'Ñ', 94: 'Ü', 95: '§', 96: '¿', 97: 'a', 98: 'b', 99: 'c',
	100: 'd', 101: 'e', 102: 'f', 103: 'g', 104: 'h', 105: 'i', 106: 'j', 107: 'k', 108: 'l', 109: 'm',
	110: 'n', 111: 'o', 112: 'p', 113: 'q', 114: 'r', 115: 's', 116: 't', 117: 'u', 118: 'v', 119: 'w',
	120: 'x', 121: 'y', 122: 'z', 123: 'ä', 124: 'ö', 125: 'ñ', 126: 'ü', 127: 'à'
};
const gsm7_values = Object.values(gsm7_charsets);
const gsm7_keys = Object.keys(gsm7_charsets);

class PduSMS {
	//*************************************************************************
	constructor(buf){
		/* массив кодировки взят из https://github.com/shokuie/gsm7 */
		this.encode_sca = res => this.encode_sca_da(res, 'SCA');
		this.encode_da = res => this.encode_sca_da(res, 'DA');
		this.decode_sca = res => this.decode_sca_da(res, 'SCA');
		this.decode_da = res => this.decode_sca_da(res, 'DA');
		//если конструктору был передан буфер то сразу декодируем его
		if(buf)
			this.decode(buf);
	}
	//*************************************************************************
	/* преобразует байт в строковое 16-ти ричное представление */
	b2s(num){
		num &= 0xFF;
		return ('00' + num.toString(16).toUpperCase()).slice(-2);
	}
	//*************************************************************************
	/* преобразует двух байтовое значение в строковое 16-ти ричное представление */
	w2s(num){
		num &= 0xFFFF;
		return ('0000' + num.toString(16).toUpperCase()).slice(-4);
	}
	//*************************************************************************
	/* возвращает kod для символа. если код не известен то возвращает null */
	gsm7_gk(chr){
		let idx = gsm7_values.indexOf(chr);
		if(idx >= 0)
			return gsm7_keys[idx];
		else
			return null; //неизвестный символ
	}
	//*************************************************************************
	/* возвращает символ(char) по его коду. если код не известен то возвращает '?' */
	gsm7_gc(code){
		if(gsm7_charsets.hasOwnProperty(code))
			return gsm7_charsets[code];
		else
			return '?'; //неизвестный код
	}
	//*************************************************************************
	/* декодер gsm7 Uint8Array массива в строку */
	gsm7_to_str(buf, len){
		let res = "";
		let um = 0, ur = 0;
		for(let a = 0; a < buf.length; a++){
			let d = buf[a];
			let v = ((d << ur++) | um) & 0x7F;
			um = (d >> (8 - ur));
			res += this.gsm7_gc(v);
			if(ur >= 7){
				res += this.gsm7_gc(um);
				um = 0; ur = 0;
			}
		}
		/* итогда бывает невожможно определить длину с последним символом.
			 для этого и передается целевая длина результата */
		if(res.length > len)
			res = res.substr(0, len);
		return res;
	}
	//*************************************************************************
	/* кодер строки в gsm7 */
	str_to_gsm7(str, raw_res){
		let len = str.length;
		let res = [ ];
		let buf = str.split('');
		//переводим в массив char кодов
		buf = buf.map((c, i) => {
			let k = this.gsm7_gk(c);
			if(k === null){
				console.warn(i, ": Incorrect char '" + c + "' for gsm7 code page!");
				k = this.gsm7_gk('?');
			}
			return k;
		});
		//добавим последний 0-й байт чтобы не вылетать за границы массива в buf[a + 1]
		buf.push(0);
		//начинаем 7-битное кодирование
		buf = new Uint8Array(buf);
		//console.log(buf2hex8(buf));
		let i = 0, x1 = 7;
		for(let a = 0; a < buf.length - 1; a++){
			let x2 = 8 - x1;
			let b1 = (1 << x1) - 1;
			let b2 = (1 << x2) - 1;
			let d1 = buf[a] & b1;
			let d2 = buf[a + 1] & b2; //для последнего байта тут будет 0
			res[i++] = d1 | (d2 << x1);
			//console.log(x1, x2, buf2hex8([b1, b2, res[i - 1]]), buf[a], buf[a + 1]);
			//если мы прошли 7 проходов
			if(!--x1){
				/* пропуск обработки следующего байта. он не нужен т.к. мы все его
					 7 бит уже и так полностью обработали в этом проходе. */
				a++;
				x1 = 7;
			}else{
				//оставшиеся от buf[a + 1] верхние октеты
				buf[a + 1] = buf[a + 1] >> x2;
			}
		}
		//console.log(res);
		if(raw_res === true)
			return res; //результат в виде массива
		res = res.map(d => this.b2s(d));
		res = res.join(''); //результат в виде 16-ти ричной байтовой строки
		return [ len, res ]; //длина в символах!
	}
	//*************************************************************************
	/* декодер ucs2 Uint8Array массива в строку */
	ucs2_to_str(buf, len){
		let buf16 = [ ];
		for(let a = 0; a < buf.length; a++){
			if(a & 0x1)
				buf16.push((buf[a - 1] << 8) | buf[a]);
		}
		buf16 = new Uint16Array(buf16);
		let res = String.fromCharCode.apply(null, buf16);
		if(res.length > len)
			res = res.substr(0, len);
		return res;
	}
	//*************************************************************************
	/* кодер строки в ucs2 */
	str_to_ucs2(str, raw_res){
		let buf = str.split('');
		buf = buf.map(c => this.w2s(c.charCodeAt(0)));
		if(raw_res === true)
			return res; //результат в виде массива
		let res = buf.join('');
		let len = (res.length / 2); //длина в байтах
		return [ len, res ]; //результат в виде 16-ти ричной байтовой строки
	}
	//*************************************************************************
	/* определяет какая кодировка(DCS) используется в str. фактически тут
		 или gsm7 или ucs2. */
	detect_dcs(str){
		let res = 0; //gsm7
		let buf = str.split('');
		for(let a = 0; a < buf.length; a++){
			let c = buf[a];
			//если хоть одного символа строки нет в gsm7 кодировке то это ucs2
			if(gsm7_values.indexOf(c) < 0)
				return 8; //ucs2
		}
		return res;
	}
	//*************************************************************************
	/* переворачивалка символов в двух символьной строке(элементы массива buf).
		 также дополняет нулем если число < 10 */
	number_reverse(buf){
		if(typeof(buf[0]) == "string") //элементы num уже в строковом формате
			return buf.map(o => o.split('').reverse().join(''));
		//элементы в числовом формате => преобразуем в строковой
		return buf.map(o => this.b2s(o).split('').reverse().join(''));
	}
	//*************************************************************************
	/* обрезает символ 'F' в последнем октете массива: строке "xF"
		 заменяя его на "x" */
	cut_lastF(num){
		if(num[num.length - 1].charAt(1) == 'F')
			num[num.length - 1] = num[num.length - 1].charAt(0);
		return num;
	}
	//*************************************************************************
	/* декодирует блок SCA - телефон Центра SMS или DA - телефон получателя */
	decode_sca_da(buf, what){
		let len = buf[0];
		let type = buf[1]; //81h - неизвестный, или 91h - международный
		/* про ToN и NPI смотри в jspdudecoder.js */
		let ToN = type & 0x70; //Type of number Bits
		if(len == 0){
			return [1, null]; //SCA отсутствует
		}
		//let NPI = type & 0xF;	// Numbering Plan Identification
		//console.log("ToN: 0x" +ToN.toString(16) + ',', " NPI: 0x" + NPI.toString(16));
		/* вот все отличие SCA формата от DA */
		if(what == 'SCA'){
			// длина указывала кол-во байт занятых под номер + 1(байт длины)
			len -= 1;
		}else{ /* DA */
			//длина указывает на !кол-во цифер! в номере. переводим в кол-во байт занятых под номер.
			len = Math.round((len + 1) / 2);
		}
		//на данном этапе len это кол-во байт полезных данных номера
		if(buf.length < len + 2) //+2 так как есть еще байты длины и типа
			return [ 2, '' ];
		let num = buf.slice(2, len + 2);
		/* про ToN И его возможные значения смотри в:
			 https://github.com/tladesignz/jsPduDecoder/blob/master/source/jspdudecoder.js */
		if(ToN == 0x50){ //Alphanumeric - номер в виде строки. например "Tele2".
			num = this.gsm7_to_str(num);
		}else{ //номер в цифровом виде(как ему и положено быть)
			num = Array.from(num);
			num = this.cut_lastF(this.number_reverse(num)).join('');
			if(ToN == 0x10) //International number
				num = '+' + num;
		}
		return [ len + 2, num ];
	}
	//*************************************************************************
	/* кодирует блок SCA или DA */
	encode_sca_da(res, what){
		let buf = [ 0, 0 ]
		let v = this[what];
		if(!v){ /* SCA/DA отсутствует */
			res.push('00');
			return 1;
		}
		buf[1] = '81'; //неизвестный
		let mr = v.match(/^\+(\d+)$/);
		if(mr){
			buf[1] = '91'; //международный: начинается на '+'
			v = mr[1];
		}
		let v_len = v.length; //ко-во цифер в номере
		if(v.length & 0x1)
			v += "F";
		v = v.match(/\w{2}/g);
		if(!v){
			console.warn("Can't parse " + what + " phone string!");
			return 0;
		}
		v = this.number_reverse(v);
		if(what == "SCA")
			buf[0] = this.b2s(v.length + 1); //+1 т.к. учитывается и res[1]
		else /* DA */
			buf[0] = this.b2s(v_len); //!кол-во цифер! в номере
		buf.push(...v);
		res.push(...buf);
		return buf.length;
	}
	//*************************************************************************
	/* выполняет кодирование UD строки в байтовый формат */
	encode_ud(ud, dcs){
		if(!ud)
			return "";
		if(dcs == 0)
			return this.str_to_gsm7(ud);
		return this.str_to_ucs2(ud);
	}
	//*************************************************************************
	/* декодер блока VP - дата и время приема/отправки сообщения. для исходящих сообщений ее проще вообще не указывать
		 задав VPF в 0.
		 для принятых сообщений не нужно смотреть на VPF биты. Они всегда 00. тем не менее VP блок всегда присутствует
		 в своем полном формате(7 байт). смотри пример тут: https://github.com/tladesignz/jsPduDecoder.
		 я в нем подсмотрел это потому, что никак не мог понять: как при VPF == 0x0, VP блок все таки есть. */
	vp_decode(buf){
		let res;
		let len = 7;
		buf = this.number_reverse(Array.from(buf.slice(0, len)));
		res = "20" + buf[0] + '-' + buf[1] + '-' + buf[2] + ' '; //дата
		res += buf[3] + ':' + buf[4] + ':' + buf[5] + ' '; //время
		/* Часовой пояс указывает разницу между местным временем и временем по Гринвичу(GMT), выраженную в четвертях часа.
			 При этом первый бит указывает знак этой разницы:
			   0 — разница положительная
			   1 — разница отрицательная.
			 То есть байт 7 в случае часового пояса GMT+3 будет иметь значение 21h. */
		let vp = parseInt(buf[6], 16);
		let polar = '+';
		if(vp & 0x80){
			vp &= 0x7F;
			polar = '-';
		}
		vp = Math.floor(vp / 4);
		res += 'GMT' + polar + vp;
		return [ len, res ];
	}
	//*************************************************************************
	/* выполняет преобразование 16-ти ричной байтовой строкови в Uint8Array */
	cook_raw_buf(buf){
		if(!(buf instanceof Uint8Array)){
			if(typeof buf == "string"){
				buf = buf.match(/(\w{2})/g).map(c => parseInt(c, 16));
				buf = new Uint8Array(buf);
			}else{
				console.warn("Unknown type of raw buf data");
				return undefined;
			}
		}
		return buf;
	}
	//*************************************************************************
	/* выполняет декодирование PDU header-а */
	decode_header(buf){
		let len;
		//console.dir(buf2hex8(buf), { maxArrayLength: 12 });
		[ len, this.SCA ] = this.decode_sca(buf); //Номер телефона Центра SMS (может не указываться)
		buf = buf.slice(len); //пропустим байты SCA
		let pdu_type = this.PDU_type = buf[0]; //Тип PDU пакета
		buf = buf.slice(1); //пропустим 1 байт
		//извлечем некоторые битовые переменные из PDU-type
		this.MTI = pdu_type & 0x3; //Message Type Indicator. 00 - принимаемое сообщение, 01 - отправляемое сообщение, 10 — отчет о доставке
		this.VPF = (pdu_type >> 3) & 0x3; //Параметр Validity Period Format, определяющий формат поля VP но только для TX SMS
		this.UDHI = (pdu_type >> 6) & 0x1; //User Data Header Included. 1 - поле UD содержит сообщение и дополнительный заголовок.
		/* MR во входящих сообщениях отсутсвует. он используется только в исходящих. */
		this.MR = 0;
		if(this.MTI == 0x01){ //если это отправляемое сообщение
			this.MR = buf[0]; //для отправляемых сообщений должно присутствовать поле MR
			buf = buf.slice(1); //пропустим 1 байт
		}
		[ len, this.DA ] = this.decode_da(buf); //DA — Destination Address - Номер телефона получателя сообщения
		buf = buf.slice(len); //пропустим байты DA
		this.PID = buf[0]; //идентификатор протокола: указывает SMSC как обрабатывать сообщение
		this.DCS = buf[1]; //схема кодирования данных в поле данных.
		//https://en.wikipedia.org/wiki/Data_Coding_Scheme
		buf = buf.slice(2); //пропустим 2 байта
		//console.dir(buf2hex8(buf), { maxArrayLength: 7 });
		//если явно указано что блок VP есть или это входящее сообщение
		if(this.VPF == 0x3 || this.MTI == 0x00){
			[len, this.VP ] = this.vp_decode(buf);
			buf = buf.slice(len); //пропустим байты VP
		}else{
			this.VP = null;
		}
		//console.dir(buft2hex8(buf), { maxArrayLength: 1 });
		this.UDL = buf[0];
		buf = buf.slice(1);
		//все. остались только полезные данные.
		return buf;
	}
	//*************************************************************************
	/* выполняет декодирование PDU строки состоящей из 16-ти ричных байтовых октетов */
	decode(buf){
		if(!buf)
			return false;
		//преобразуем в Uint8Array в не зависимости от формата buf
		buf = this.cook_raw_buf(buf);
		if(!buf)
			return false;
		buf = this.decode_header(buf);
		let len = this.UDL;
		if(this.UDHI){ //если есть заголовок
			/* он может присутствовать чтобы указать на тип контента в UD(SMS body).
				 например я его встречал в содержащих url сообщениях. */
			len = buf[0] + 1; //длина user заголовка
			this.UDH = buf.slice(0, len);
			buf = buf.slice(len);
			//содержимое заголовка мы просто игнорируем
			len = this.UDL - len;
		}
		//console.dir(buf2hex8(buf), { maxArrayLength: 20 });
		/* схема кодирования данных в поле данных. Фактически здесь используется только два варианта:
			 00h – данные пользователя (UP) кодируются 7-битовым алфавитом, при этом восемь символов
				запаковываются в семь байтов и сообщение может содержать до 160 символов.
			 08h - кодировка UCS2, используется для передачи кириллицы.
				Один символ кодируется 2-мя байтами. Можно передать только 70 символов в одном сообщении. */
		if(this.DCS == 0) //кодировка gsm7
			this.UD = this.gsm7_to_str(buf, len);
		else if(this.DCS == 8) //кодировка UCS2
			this.UD = this.ucs2_to_str(buf, Math.floor(len / 2));
		else
			console.warn("Unknown encoding:", this.DCS);
		if(this.UD)
			return true;
		return false;
	}
	//*************************************************************************
	/* выполняет кодирование значений внутренних переменных в PDU строку */
	encode(obj){
		if(obj)
			return this.encode_from_obj(obj);
		let res = [ ];
		let i = 0;
		//SCA
		this.encode_sca(res);
		i = res.length;
		//PDU-type
		res[i++] = this.b2s(this.PDU_type);
		//MR - порядковый номер сообщения, определяется самим модемом
		res[i++] = '00';
		//DA - номер получателя
		i += this.encode_da(res);
		//PID
		if(!this.PID)
			this.PID = 0;
		res[i++] = this.b2s(this.PID);
		//DCS - кодировка сообщения
		this.DCS = this.detect_dcs(this.UD);
		res[i++] = this.b2s(this.DCS);
		//VP - 0 байт(пустое поле)
		if(this.VP)
			console.warn("VP is not supported!");
		//UD
		let [ len, ud ] = this.encode_ud(this.UD, this.DCS);
		//UDL - длина полезных данных
		this.UDL = len;
		res[i++] = this.b2s(len);
		res.push(...ud);
		return res.join('');
	}
	//*************************************************************************
	/* вспомогательная функция призванная упростить заполнение полей этого объекта перед
		 вызовом encode(). ожидает в obj номер телефона получателя и текст SMS сообщения. */
	encode_from_obj(obj){
		/* не используем SCA(номер телефона Центра SMS). модем просто будет
			 использовать тот, что задан в сим карте. посмотреть его можно командой AT+CSCA? */
		this.SCA = null;
		/* Для упрощения условимся не использовать поле VP (время жизни SMS).
			 и установим биты VPF в нулевое значение. Также в нулевое значение установим биты RP.
			 Биты MTI отправляемого сообщения необходимо установить в значение 01.
			 Таким образом значение байта поля PDU type принимаем равным 01h. */
		this.PDU_type = 1;
		this.DA = obj.phone;
		this.PID = 0;
		this.DCS = 0;
		this.VP = null;
		this.UD = obj.message;
		return this.encode();
	}
	//*************************************************************************
	/* возвращает кол-во байт в буфере за вычетом байтов для SCA. в частности
		 это кол-во байт используется для команды AT+CMGS=xx */
	get_cmgs_len(buf){
		let res = Math.floor(buf.length / 2);
		if(res == 0)
			return 0;
		let sca_len = parseInt(buf.substr(0, 2), 16) + 1; //+1 так как с учетом байта длины
		if(sca_len < res)
			return res - sca_len;
		return 0;
	}
	//*************************************************************************
	/* возвращает строку с PDU данными. например для console.log() */
	toString(){
		let keys = [ "SCA\n", "PDU_type\n", "DA\n", "VP\n", "PID", "DCS", "MTI", "VPF", "UDHI", "UDL" ];
		let res = "";
		keys.forEach((p, i) => {
			let nl = false;
			if(/\n$/.test(p)){
				p = p.replace(/\n$/, '');
				nl = true;
			}
			if(this[p] == undefined || this[p] == null)
				return;
			res += p + ': ' + this[p];
			if(nl)
				res += "\n";
			else
				res += ", ";
		});
		res = res.replace(/, (\n|$)/g, '\n');
		if(this.UDH)
			res += "UDH: [ " + buf2hex8(this.UDH).join(" ") + " ]\n";
		res += this.UD;
		res = res.replace(/\n$/, '');
		return res;
	}
};

/************************* PDU SMS concatination **************************/
//*************************************************************************
/* вспомогательная ф-я: выполняет конкатенацию UD строк полученных ранее
	 ~кусочков~(pdu объектов) одного и того же SMS сообщения в общую UD строку */
function join_concatenated_sms_parts(all_parts){
	//кусочки могут приходить не по порядку так что сортируем их номера
	let all_keys = Object.keys(all_parts);
	all_keys = all_keys.map(v => Number(v)).sort((a, b) => a - b);
	if(all_keys.length == 0)
		return false;
	let res_UD = "";
	all_keys.forEach(k => res_UD += all_parts[k].UD);
	return res_UD;
}
//*************************************************************************
/* декодирует поля UDH заголовка для concatenated SMS.
	 подробнее смотри: https://en.wikipedia.org/wiki/Concatenated_SMS */
function decode_parted_UDH(UDH){
	if(!UDH)
		return false;
	//случай для 8 bit CSMS
	if(UDH[0] == 5 && UDH[1] == 0 && UDH[2] == 3 && UDH.length == 6){
		return {
			ref_num: UDH[3],
			total_num_of_parts: UDH[4],
			this_part_num: UDH[5]
		}
	}
	//случай для 16 bit CSMS
	if(UDH[0] == 6 && UDH[1] == 8 && UDH[2] == 4 && UDH.length == 7){
		return {
			ref_num: (UDH[3] << 8) || UDH[4],
			total_num_of_parts: UDH[5],
			this_part_num: UDH[6]
		}
	}
	return false;
}
//*************************************************************************
/* проверяет две SMS(pdu объекты) на принадлежность
	 к одной и той же concated SMS */
function check_for_sms_concated_signs(pdu1, pdu2){
	if(!pdu1 || !pdu2)
		return false;		
	if(pdu1.DA != pdu2.DA)
		return false; //номера отправителей разные 
	if(pdu1.VP != pdu2.VP){
		let t1 = new Date(pdu1.VP);
		let t2 = new Date(pdu2.VP);
		//если разница во времени прихода этих двух SMS > 60 сек
		if(Math.abs(t2 - t1) > 60000)
			return false;
	}
	return true;
}
//*************************************************************************
/* выполняет поиск среди массива ~кусочков-объектов~ { pdu: PduSMS }
	 одного и тогоже SMS послания. все кусочки в итоге склеиваются в одну
	 UD строку и она назначается pdu объекту самого младшего(как правило
	 с part_num == 1) кусочка. остальные объекты кусочков помечаются
	 на пропуск путем установки поля pdu := null */
function do_sms_concatenate(objs_list){
	let res = [ ];
	for(let a = 0; a < objs_list.length; a++){
		let obj = objs_list[a];
		let pdu1 = obj.pdu;
		if(!pdu1)
			continue;
		//console.log(pdu.UDH);
		let UDH1 = decode_parted_UDH(pdu1.UDH);
		//если это SMS сообщение это часть большого послания разбитого на куски
		if(UDH1){
			let all_parts = { };
			//самый первый кусочек найден
			all_parts[UDH1.this_part_num] = pdu1;
			obj.pieces = [ obj.id ];
			//ищем остальные куски этого послания
			for(let b = a + 1; b < objs_list.length; b++){
				let obj2 = objs_list[b];
				let pdu2 = obj2.pdu;					
				if(!check_for_sms_concated_signs(pdu1, pdu2))
					continue;
				let UDH2 = decode_parted_UDH(pdu2.UDH);
				if(UDH2 && UDH2.ref_num == UDH1.ref_num){
					if(UDH2.total_num_of_parts != UDH1.total_num_of_parts)
						continue;
					//очередной кусочек найден
					all_parts[UDH2.this_part_num] = pdu2;
					obj2.pdu = null;
					//так же запоминаем все кусочки в массив кусочков
					obj.pieces.push(obj2.id);
				}
			}
			/* теперь обработаем все найденные кусочки и соберем
				 из них одно общее послание */
			let join_res = join_concatenated_sms_parts(all_parts);
			if(join_res){
				pdu1.UD = join_res;
				res.push(obj);
			}				
		}else{
			//это обычное сообщение(не из кусочков)
			res.push(obj);
		}
	}
	return res;
}
PduSMS.prototype.do_sms_concatenate = do_sms_concatenate;

export default PduSMS;
