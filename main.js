/* парсилка PDU формата SMS-ок получаемых AT командами с модема.
		разобрался со всем за ~8 часов.
	 смотри Send_Ru_SMS_using_GSM_Neoway.pdf(гуглится и сохранен у меня в notes)
		а так же http://webstm32.sytes.net/user-files/lab/PDU_SMS.htm
		и особенно в https://github.com/tladesignz/jsPduDecoder
*/

function buf2hex8(buffer){
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16).toUpperCase()).slice(-2));
}
function buf2hex16(buffer){
  return Array.prototype.map.call(new Uint16Array(buffer), x => ('0000' + x.toString(16).toUpperCase()).slice(-4));
}

class PduSMS {
	//*************************************************************************
	constructor(buf){
		/* массив кодировки взят из https://github.com/shokuie/gsm7 */
		this.gsm7_charsets = {
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
		if(buf)
			this.decode(buf);
	}
	//*************************************************************************
	/* возвращает символ по его коду. если код не известен то возвращает '?' */
	gsm7_gc(code){
		let gsm7_charsets = this.gsm7_charsets;
		if(gsm7_charsets.hasOwnProperty(code))
			return gsm7_charsets[code];
		else
			return '?'; //неизвестный символ
	}
	//*************************************************************************
	/* декодер gsm7 Uint8Array массива в строку */
	gsm7_to_str(buf){
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
		return res;
	}
	//*************************************************************************
	/* декодер ucs2 Uint8Array массива в строку */
	ucs2_to_str(buf){
		let buf16 = [ ];
		for(let a = 0; a < buf.length; a++){
			if(a & 0x1)
				buf16.push((buf[a - 1] << 8) | buf[a]);
		}
		buf16 = new Uint16Array(buf16);		
		return String.fromCharCode.apply(null, buf16);
	}
	//*************************************************************************
	/* переворачивалка символов в двух символьной строке.
		 так же дополняет нулем если число < 10 */
	number_reverse(num){
		return num.map(o => ('00' + o.toString(16).toUpperCase()).
			slice(-2).split('').reverse().join(''));
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
	/* парсит блок SCA - Номер телефона Центра SMS (может не указываться) */
	parse_sca(buf){
		let len = buf[0];
		//длина может быть 0-й(пустое поле sca)
		if(len < 1  || buf.length < len)
			return [ 1, '' ];
		let type = buf[1]; //81h - неизвестный, или 91h - международный
		let num = Array.from(buf.slice(2, len + 1));
		num = this.cut_lastF(this.number_reverse(num)).join('');
		//console.log(len, type.toString(16), num);
		if(type == 0x91)
			num = '+' + num;
		return [ len + 1, num ];
	}
	//*************************************************************************
	/* парсит блок DA - номер телефона отправителя/получателя.
		 у него ~немного другой формат~ относительно SCA! */
	parse_phone(buf){
		let len = buf[0];
		let type = buf[1]; //81h - неизвестный, или 91h - международный
		/* про ToN и NPI смотри в jspdudecoder.js */
		let ToN = type & 0x70; //Type of number Bits
		//let NPI = type & 0xF;	// Numbering Plan Identification
		//console.log("ToN: 0x" +ToN.toString(16) + ',', " NPI: 0x" + NPI.toString(16));
		//длина указывает на !кол-во цифер! в номере. переводим в кол-во байт.
		len = Math.round((len + 1) / 2);
		if(buf.length < len + 2)
			return [ 2, '' ];
		let num = buf.slice(2, len + 2);
		/* про ToN И его значения смотри в:
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
	/* декодер блока VP - дата и время приема/отправки сообщения. для исходящих сообщений ее проще вообще не указывать
		 задав VPF в 0.
		 для принятых сообщений не нужно смотреть на VPF биты. Они всегда 00. тем не менее VP блок всегда присутствует
		 в своем полном формате(7 байт). смотри пример тут: https://github.com/tladesignz/jsPduDecoder.
		 я в нем подсмотрел это потому что никак не мог понять: как при VPF == 0x0, VP блок все таки есть. */
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
		let vp = buf[6];
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
				console.warn("Unknown type of buf");
				return undefined;
			}
		}
		return buf;
	}
	//*************************************************************************
	/* выполняет декодирование PDU header-а */
	decode_header(buf){
		let len;
		[ len, this.SCA ] = this.parse_sca(buf, 0); //Номер телефона Центра SMS (может не указываться)
		buf = buf.slice(len); //пропустим байты SCA
		let pdu_type = this.PDU_type = buf[0]; //Тип PDU пакета
		buf = buf.slice(1); //пропустим 1 байт
		//извлечем некоторые битовые переменные из PDU-type
		this.VPF = (pdu_type >> 3) & 0x3; //Параметр Validity Period Format, определяющий формат поля VP но только для TX SMS
		this.UDHI = (pdu_type >> 6) & 0x1; //User Data Header Included. 1 - поле UD содержит сообщение и дополнительный заголовок.
		/* MR в входящих сообщениях отсутсвует. он используется только в исходящих. */
		[ len, this.DA ] = this.parse_phone(buf); //DA — Destination Address - Номер телефона получателя сообщения
		buf = buf.slice(len); //пропустим байты DA
		this.PID = buf[0]; //идентификатор протокола: указывает SMSC, как обрабатывать сообщение
		this.DCS = buf[1]; //схема кодирования данных в поле данных.
		//https://en.wikipedia.org/wiki/Data_Coding_Scheme
		buf = buf.slice(2); //пропустим 2 байта
		//console.dir(buf2hex8(buf), { maxArrayLength: 7 });
		[len, this.VP ] = this.vp_decode(buf);
		buf = buf.slice(len); //пропустим байты DA
		//console.dir(but2hex8(buf), { maxArrayLength: 1 });
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
		buf = this.cook_raw_buf(buf);
		if(!buf)
			return false;
		buf = this.decode_header(buf);
		//console.dir(but2hex8(buf), { maxArrayLength: 20 });
		let len;
		if(this.UDHI){ //если есть заголовок
			/* он может присутствовать чтобы указать на тип контента в UD.
				 например я его встречал в содержащих url сообщениях. */
			len = buf[0]; //длина user заголовка
			buf = buf.slice(len + 1);
			//содержимое заголовка мы просто игнорируем
		}
		/* схема кодирования данных в поле данных. Фактически здесь используется только два варианта:
			 00h – данные пользователя (UP) кодируются 7-битовым алфавитом, при этом восемь символов
				запаковываются в семь байтов и сообщение может содержать до 160 символов.
			 08h - кодировка UCS2, используется для передачи кириллицы.
				Один символ кодируется 2-мя байтами. Можно передать только 70 символов в одном сообщении. */
		if(this.DCS == 0) //кодировка gsm7
			this.UD = this.gsm7_to_str(buf);
		else if(this.DCS == 8) //кодировка UCS2
			this.UD = this.ucs2_to_str(buf);
		else
			console.warn("Unknown encoding:", this.DCS);		
		if(this.UD)
			return true;
		return false;
	}
	//*************************************************************************
	/* возвращает строку с PDU данными. например для console.log() */
	toString(){
		let keys = [ "SCA\n", "PDU_type\n", "DA\n", "VP\n", "PID", "DCS", "VPF", "UDHI", "UDL" ];
		let res = "";
		keys.forEach((p, i) => {
			let nl = false;
			if(/\n$/.test(p)){
				p = p.replace(/\n$/, '');
				nl = true;
			}
			res += p + ': ' + this[p];
			if(nl)
				res += "\n";
			else
				res += ", ";
		});
		res = res.replace(/, (\n|$)/g, '\n');
		res += this.UD;
		res = res.replace(/\n$/, '');
		return res;
	}
};

let pdu = new PduSMS();
/* decode tests */
let buf1 = '07917360489991F94409D0D432BB2C030008021061413024805C050003C60303' + '00730033002F006100380038003200370032003900330064003400650039003F00730067007500690064003D00310032003000370032003200300039005F0031003500370037003600360034003000300030000D000A';
let buf2 = '07917360489991F9040B917360466237F100080250010160902122' + '041F04400438043204350442002E0020041A0430043A002004340435043B0430002E';
let buf3 = '07917360489991F9040B917360466237F10000025011816341210AD4F29C1E8BC964B319';
let buf4 = '07917360489991F9040B917360466237F10000025011810433215154747A0E4ACF416190BD2CCF83D86FF719D42ECFE7E173197447A7C768D01CFDAEB3C9A039FA7D07D1D1613A888E2E836E20719A0E12A7E9A0FB5BBE9E83C66FB9BC3CA6B3F321';
let bufs = [ buf3 ] //, buf2, buf3, buf4 ];
//bufs = require('fs').readFileSync("./data.txt").toString().split("\n");
bufs.forEach((buf, i) => {
	//console.log(i);
	if(pdu.decode(buf) === false)
		return;
	console.log(pdu.toString());
	console.log("");
});

/* encode tests */
pdu.SCA = null;
