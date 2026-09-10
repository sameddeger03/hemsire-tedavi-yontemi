import { sanitize, LARGE_LABEL } from './utils.js'

export function generateTedaviLabel(patientName, medName, dose, route, hour, minute, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 260 : 140

  const nameLine = isLarge
    ? `^ADN,40,20^FO0,20^FD${sanitize(patientName)}^FS`
    : `^ADN,32,15^FO30,10^FD${sanitize(patientName)}^FS`

  const infoLine = isLarge
    ? `^ADN,40,20^FO0,70^FD${sanitize(medName.substring(0, 12))}^FS^ADN,40,20^FO0,120^FD${sanitize(dose)}^FS^ADN,40,20^FO0,170^FD${sanitize(route)}^FS^ADN,80,50^FO320,60^FD${sanitize(hour)}^FS^ADN,80,50^FO320,120^FD${sanitize(minute)}^FS`
    : `^ADN,32,15^FO30,60^FD${sanitize(medName.substring(0, 9))}^FS^ADN,28,15^FO270,60^FD${sanitize(route)}^FS^ADN,32,15^FO30,110^FD${sanitize(dose)}^FS^ADN,60,30^FO200,105^FD${sanitize(hour)}^FS^ADN,28,16^FO270,105^FD${sanitize(minute)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${nameLine}\n${infoLine}\n^XZ`
}
