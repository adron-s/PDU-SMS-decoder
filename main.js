/* парсилка PDU формата SMS-ок получаемых AT командами с модема.
		разобрался со всем за ~8 часов.
	 смотри Send_Ru_SMS_using_GSM_Neoway.pdf(гуглится и сохранен у меня в notes)
		а так же http://webstm32.sytes.net/user-files/lab/PDU_SMS.htm
		и особенно в https://github.com/tladesignz/jsPduDecoder
*/

function buf2hex(buffer){
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16).toUpperCase()).slice(-2));
}
function buf2hex16(buffer){
  return Array.prototype.map.call(new Uint16Array(buffer), x => ('0000' + x.toString(16).toUpperCase()).slice(-4));
}

/* простейший декодер gsm7 Uint8Array массива в строку
	массив кодировки взят из взято из https://github.com/shokuie/gsm7 */
const gsm7_charset = {
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
function gsm7_gc(code){
	if(gsm7_charset.hasOwnProperty(code))
		return gsm7_charset[code];
	else
		return '?'; //неизвестный символ
}
function gsm7_to_unicode(buf){
	let res = "";
	let um = 0, ur = 0;
	for(let a = 0; a < buf.length; a++){
		let d = buf[a];
		let v = ((d << ur++) | um) & 0x7F;
		um = (d >> (8 - ur));
		res += gsm7_gc(v);
		if(ur >= 7){
			res += gsm7_gc(um);
			um = 0; ur = 0;
		}
	}
	return res;
}

function number_revert(num){
	return num.map(o => ('00' + o.toString(16).toUpperCase()).
		slice(-2).split('').reverse().join(''));
}

function cut_nlF(num){
	if(num[num.length - 1].charAt(1) == 'F')
		num[num.length - 1] = num[num.length - 1].charAt(0);
	return num;
}

/* парсит блок sca - Номер телефона Центра SMS (может не указываться)*/
function parse_sca(buf){
	let len = buf[0];
	//длина может быть 0-й(пустое поле sca)
	if(len < 1  || buf.length < len)
		return [ 1, '' ];
	let type = buf[1]; //81h - неизвестный, или 91h - международный
	let num = Array.from(buf.slice(2, len + 1));
	num = cut_nlF(number_revert(num)).join('');
	//console.log(len, type.toString(16), num);
	if(type == 0x91)
		num = '+' + num;
	return [ len + 1, num ];
}

/* парсит блок номера телефона отправителя/получателя.
	 он в немного другом формате относительно SCA. */
function parse_phone_num(buf){
	let len = buf[0];
	let type = buf[1]; //81h - неизвестный, или 91h - международный
	/* про ToN и NPI смотри в jspdudecoder.js */
	let ToN = type & 0x70; //Type of number Bits
	let NPI = type & 0xF;	// Numbering Plan Identification
	//console.log("ToN: 0x" +ToN.toString(16) + ',', " NPI: 0x" + NPI.toString(16));
	//длина указывает на !кол-во цифер! в номере. переводим в кол-во байт.
	len = Math.round((len + 1) / 2);
	if(buf.length < len + 2)
		return [ 2, '' ];
	let num = buf.slice(2, len + 2);
	if(ToN == 0x50){ //Alphanumeric - номер в виде строки. например "Tele2". смотри в jspdudecoder.js.
		num = gsm7_to_unicode(num);
	}else{ //номер в цифровом виде(как ему и положено быть)
		num = Array.from(num);
		num = cut_nlF(number_revert(num)).join('');
	}
	if(type == 0x91)
		num = '+' + num;
	return [ len + 2, num ];
}

/* декодер блока VP - дата и время приема/отправки сообщения. для исходящих сообщений ее проще вообще не указывать
	 задав VPF в 0.
	 для принятых сообщений не нужно смотреть на VPF биты. Они всегда 00. тем не менее VP блок всегда присутствует.
	 смотри пример тут: https://github.com/tladesignz/jsPduDecoder. я в нем подсмотрел это потому что никак
	 не мог понять как при VPF == 0x0 VP блок есть */
function vp_decode(buf){
	let res;
	let len = 7;
	buf = number_revert(Array.from(buf.slice(0, len)));
	res = "20" + buf[0] + '-' + buf[1] + '-' + buf[2] + ' '; //дата
	res += buf[3] + ':' + buf[4] + ':' + buf[5] + ' '; //время
	/* Часовой пояс указывает разницу между местным временем и временем по Гринвичу(GMT), выраженную в четвертях часа.
		 При этом первый бит указывает знак этой разницы:
		   0 — разница положительная
		   1 — разница отрицательная.
		 То есть байт 7 в случае часового пояса GMT+3 будет иметь значение 21h. */
	let timezone = buf[6];
	let polar = '+';
	if(timezone & 0x80){
		timezone &= 0x7F;
		polar = '-';
	}
	timezone = Math.floor(timezone / 4);
	res += 'GMT' + polar + timezone;
	return [ len, res ];
}
let buf =	'07917360489991F94409D0D432BB2C030008021061413024805C050003C60303' +
	'00730033002F006100380038003200370032003900330064003400650039003F00730067007500690064003D00310032003000370032003200300039005F0031003500370037003600360034003000300030000D000A';
//let buf = '07917360489991F9040B917360466237F100080250010160902122' + '041F04400438043204350442002E0020041A0430043A002004340435043B0430002E';
//let buf = '07917360489991F9040B917360466237F10000025011816341210AD4F29C1E8BC964B319';
//let buf = '07917360489991F9040B917360466237F10000025011810433215154747A0E4ACF416190BD2CCF83D86FF719D42ECFE7E173197447A7C768D01CFDAEB3C9A039FA7D07D1D1613A888E2E836E20719A0E12A7E9A0FB5BBE9E83C66FB9BC3CA6B3F321';
buf = buf.match(/(\w{2})/g).map(c => Number("0x" + c));
buf = new Uint8Array(buf);
let len, smsc_num, da_num, vp;
[ len, smsc_num ] = parse_sca(buf, 0); //Номер телефона Центра SMS (может не указываться)
console.log("MSMC:", smsc_num);
buf = buf.slice(len); //пропустим байты SCA
let pdu_type = buf[0]; //Тип PDU
console.log("PDU-type:", pdu_type);
let vpf = (pdu_type >> 3) & 0x3; //Параметр Validity Period Format, определяющий формат поля VP но только для TX SMS
let udhi = (pdu_type >> 6) & 0x1//User Data Header Included. 1 - поле UD содержит сообщение и дополнительный заголовок.
buf = buf.slice(1); //пропустим 1 байт
[ len, da_num ] = parse_phone_num(buf); //DA — Destination Address - Номер телефона получателя сообщения
console.log("DA:", da_num);
buf = buf.slice(len); //пропустим байты DA
let pid = buf[0]; //идентификатор протокола: указывает SMSC, как обрабатывать сообщение
let dcs = buf[1]; //схема кодирования данных в поле данных.
//https://en.wikipedia.org/wiki/Data_Coding_Scheme
buf = buf.slice(2); //пропустим 2 байта
//console.dir(buf2hex(buf), { maxArrayLength: 7 });
[len, vp ] = vp_decode(buf);
console.log("VP:", vp);
buf = buf.slice(len); //пропустим байты DA
//console.dir(buf2hex(buf), { maxArrayLength: 1 });
let udl = buf[0];
buf = buf.slice(1);
console.log("PID:", pid, "DCS:", dcs, "VPF:", "UDHI:", udhi, vpf, "UDL:", udl, "bytes", "buf.length:", buf.length);
//все. остались только полезные данные.
//	console.dir(buf2hex(buf), { maxArrayLength: 20 });
/* схема кодирования данных в поле данных. Фактически здесь используется только два варианта:
	00h – данные пользователя (UP) кодируются 7-битовым алфавитом, при этом восемь символов
		запаковываются в семь байтов и сообщение может содержать до 160 символов.
	08h - кодировка UCS2, используется для передачи кириллицы.
		Один символ кодируется 2-мя байтами. Можно передать только 70 символов в одном сообщении. */
if(dcs == 0){ //кодировка gsm7
	console.log(gsm7_to_unicode(buf));
}else if(dcs == 8){ //кодировка UCS2
	let buf16 = [ ];
	if(udhi){
		/* заголовок может присутствовать чтобы указать на тип контента в сообщении.
			 например я его встречал дял url сообщений. */
		len = buf[0]; //длина user заголовка
		buf = buf.slice(len + 1);
	}
	//console.dir(buf2hex(buf), { maxArrayLength: 20 });
	for(let a = 0; a < buf.length; a++){
		if(a & 0x1)
			buf16.push((buf[a - 1] << 8) | buf[a]);
	}
	buf16 = new Uint16Array(buf16);
	//console.log(buf2hex16(buf16));
	let str = String.fromCharCode.apply(null, buf16);
	console.log(str);
}
