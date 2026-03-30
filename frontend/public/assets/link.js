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
var EuiIconLink = function EuiIconLink(_ref) {
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
    d: "M9.723 7.602a3.003 3.003 0 0 1 2.901.775l1.497 1.502a3.001 3.001 0 0 1-4.242 4.243l-1.502-1.498a3.002 3.002 0 0 1-.774-2.9l.9.9c.029.47.221.933.58 1.292l1.502 1.498a2 2 0 0 0 2.83-2.828l-1.498-1.502a1.994 1.994 0 0 0-1.292-.58l-.902-.902Z"
  }), ___EmotionJSX("path", {
    d: "m11.354 10.646-.707.707-6-6 .707-.707 6 6Z"
  }), ___EmotionJSX("path", {
    d: "M1.879 1.879a3 3 0 0 1 4.242-.001l1.503 1.499a3 3 0 0 1 .773 2.9l-.9-.902a1.991 1.991 0 0 0-.58-1.291L5.414 2.586a2 2 0 1 0-2.828 2.828l1.498 1.502c.358.358.82.55 1.29.58l.901.9a3.002 3.002 0 0 1-2.899-.773L1.878 6.121a3 3 0 0 1 0-4.242Z"
  }));
};
export var icon = EuiIconLink;