/*
 * qwui mark.
 *
 * The artwork lives in public/qwui-mark.svg and is referenced rather than
 * inlined, so the shape exists in exactly one place: the same file backs the
 * favicon. Inlining it would mean keeping two copies of the path data in step.
 *
 * The mark keeps its own red in both themes, as a brand mark should, so there is
 * nothing here for the theme to drive.
 */

const MARK_SRC = '/qwui-mark.svg';

/**
 * Decorative by default: the surrounding text already names the product, so the
 * image is hidden from assistive technology. Pass a title where the mark stands
 * alone and needs to be announced.
 */
export const QwuiMark = ({ size = 24, title, className }) => (
  <img
    src={MARK_SRC}
    width={size}
    height={size}
    className={className}
    alt={title || ''}
    aria-hidden={title ? undefined : 'true'}
    draggable="false"
  />
);

export default QwuiMark;
