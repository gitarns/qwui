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
var EuiIconKeyboard = function EuiIconKeyboard(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M0 3h16v11H0V3Zm15 10V4H1v9h14ZM2 5h2v1H2V5Zm2 7v-1H2v1h2Zm10-1v1h-2v-1h2Zm-3 1v-1H5v1h6ZM5 5h1v1H5V5ZM3 7H2v1h1V7Zm3 0h1v1H6V7ZM3 9H2v1h1V9Zm3 0h1v1H6V9Zm2-4H7v1h1V5ZM4 7h1v1H4V7Zm5 0H8v1h1V7Zm1 0h1v1h-1V7ZM5 9H4v1h1V9Zm3 0h1v1H8V9Zm3 0h-1v1h1V9ZM9 5h1v1H9V5Zm3 0h-1v1h1V5Zm1 0h1v1h-1V5Zm1 2h-2v3h2V7Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconKeyboard;