#!/bin/sh
#выполняет обфускацию кода этого ES6 модуля

#корневой каталог нашего приложения
root="../src"

#ф-я обфускации js кода
_obfusc(){
	local src="${1}"
	local dst="${2}"
	local or_size
	#cat ${src} > ${dst}; return #for debug
	node ./scripts/obfusc.js ${src} > ${dst}
	or_size=$(du -h ${src} | sed 's/\t\+.*//')
	echo -n "Obfuscating: ${or_size}->"
	du -h ${dst} | sed -e 's/\t\+/ /g'
}
obfusc(){
	local what="${1}"
	_obfusc "${root}/${what}" "./res/${what}"
}

rm -Rf ./res
mkdir ./res
obfusc pdu-sms.js
cat ./res/pdu-sms.js > /home/adron/vscode/mstp-web/js/pdu-sms.js
