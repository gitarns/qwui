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
var EuiIconBranchUser = function EuiIconBranchUser(_ref) {
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
    fillRule: "evenodd",
    d: "M6 7.987a3.49 3.49 0 0 0-2.5 1.05v-4.1a2 2 0 1 0-1 0v6.126a2 2 0 1 0 1.034.01A2.5 2.5 0 0 1 6 8.986h1a3.5 3.5 0 0 0 3.47-3.043 2 2 0 1 0-1.009-.017A2.5 2.5 0 0 1 7 7.987H6zM4 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm0 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm7-9a1 1 0 1 1-2 0 1 1 0 0 1 2 0z",
    clipRule: "evenodd"
  }), ___EmotionJSX("path", {
    d: "M13.5 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM9 15c.284-1.223 1.519-2.143 3-2.143s2.716.92 3 2.143H9z"
  }));
};
export var icon = EuiIconBranchUser;