var _excluded = ["title", "titleId"];
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// THIS IS A GENERATED FILE. DO NOT MODIFY MANUALLY. @see scripts/compile-icons.js

import * as React from 'react';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconThumbDown = function EuiIconThumbDown(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M12 7h1v2h-1V7Z"
  }), ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M7.8 14.22a1.135 1.135 0 0 1-1.89.437 3.221 3.221 0 0 1-.655-3.519l.484-1.132H3.001a2 2 0 0 1-1.977-2.308L1.74 3.12a2.5 2.5 0 0 1 2.47-2.114h2.988c.995 0 1.972.23 2.859.666a.999.999 0 0 1 .941-.666h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3a1 1 0 0 1-.943-.67A5.012 5.012 0 0 0 8.268 12.8L7.8 14.22Zm6.198-12.214h-3v8h3v-8ZM6.626 13.958c.07.073.193.044.225-.051l.467-1.42a6.012 6.012 0 0 1 2.68-3.309V2.78a5.472 5.472 0 0 0-2.8-.774H4.21a1.5 1.5 0 0 0-1.483 1.269l-.714 4.577A1 1 0 0 0 3 9.006h3.497a.5.5 0 0 1 .46.697l-.784 1.829a2.222 2.222 0 0 0 .452 2.426Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconThumbDown;