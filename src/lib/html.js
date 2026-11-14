// Winziger Template-Helfer: escaped alle eingesetzten Werte, außer sie stammen selbst aus html``.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const render = (value) => {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value == null || value === false) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
};

export const html = (strings, ...values) =>
  new SafeHtml(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));

/** Ersetzt den Inhalt eines Elements durch ein html``-Fragment. */
export const mount = (element, fragment) => {
  element.innerHTML = fragment.value;
};
