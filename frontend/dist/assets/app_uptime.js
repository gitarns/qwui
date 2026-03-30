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
var EuiIconAppUptime = function EuiIconAppUptime(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 32,
    height: 32,
    viewBox: "0 0 32 32",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M4.216 12.377A10.948 10.948 0 0 0 2.181 17H.153a12.941 12.941 0 0 1 2.693-6.118l1.37 1.495Zm2.948-2.703-1.37-1.495A12.94 12.94 0 0 1 13 6v2c-2.144 0-4.144.613-5.836 1.674Z",
    className: "euiIcon__fillSecondary"
  }), ___EmotionJSX("path", {
    d: "M26 4.414V19c0 7.18-5.82 13-13 13C6.5 32 1.115 27.23.153 21H2.18c.94 5.12 5.427 9 10.819 9 6.075 0 11-4.925 11-11V4.414l-4.293 4.293-1.414-1.414L25 .586l6.707 6.707-1.414 1.414L26 4.414Zm-7.836 9.909 1.472 1.354-7.577 8.235-4.835-4.442 1.353-1.473 3.364 3.09 6.223-6.764Z"
  }));
};
export var icon = EuiIconAppUptime;