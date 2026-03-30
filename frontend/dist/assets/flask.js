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
var EuiIconFlask = function EuiIconFlask(_ref) {
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
    d: "M5 2h1v4.853l-3.793 5.886-.006.01A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.299-2.25l-.006-.01L10 6.853V2h1V1H5v1Zm2 1V2h2v5.147l1.53 2.374A6.506 6.506 0 0 0 10 9.5c-.847 0-1.548.28-2.158.525l-.028.01C7.18 10.29 6.64 10.5 6 10.5c-.474 0-.828-.054-1.083-.12L7 7.147V6h1V5H7V4h1V3H7Zm-2.646 8.253L3.062 13.26A.5.5 0 0 0 3.5 14h9a.5.5 0 0 0 .438-.741l-1.664-2.583c-.258-.088-.668-.176-1.274-.176-.64 0-1.18.21-1.814.464l-.028.011c-.61.244-1.311.525-2.158.525-.737 0-1.27-.112-1.646-.247Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconFlask;