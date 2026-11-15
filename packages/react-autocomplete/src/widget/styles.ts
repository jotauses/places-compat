export const STYLE_ATTRIBUTE = 'data-places-compat';

const CSS = [
  '.pac-container{background-color:#fff;border:1px solid #d9d9d9;border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box;font-family:Arial,sans-serif;overflow:hidden}',
  '.pac-item{border-top:1px solid #e6e6e6;color:#515151;cursor: default;font-size:11px;line-height:30px;overflow:hidden;padding:0 4px;text-align:left;text-overflow:ellipsis;white-space:nowrap}',
  '.pac-item:first-child{border-top:0}',
  '.pac-item:hover{background-color:#fafafa}',
  '.pac-item-selected,.pac-item-selected:hover{background-color:#ebf2fe}',
  '.pac-item-query{color:#000;font-size:13px;padding-right:3px}',
  '.pac-matched{font-weight:700}',
  '.pac-icon{display:inline-block;height:20px;margin-right:7px;margin-top:6px;vertical-align:top;width:15px}',
  '.pac-icon-marker{border:2px solid #9e9e9e;border-radius:50% 50% 50% 0;box-sizing:border-box;height:10px;margin:10px 9px 0 4px;transform:rotate(-45deg);width:10px}',
  '.pac-attribution{color:#5E5E5E;font-family:Roboto,sans-serif;font-size:12px;font-style:normal;font-weight:400;letter-spacing:normal;line-height:16px;padding:4px 8px;text-align:right;white-space:nowrap}',
].join('\n');

export function injectStyles(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document);
  const head = target?.head;
  if (!target || !head) return;
  if (head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) return;
  const style = target.createElement('style');
  style.setAttribute(STYLE_ATTRIBUTE, '');
  style.textContent = CSS;
  head.insertBefore(style, head.firstChild);
}
