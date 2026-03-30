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
var EuiIconStreamsWired = function EuiIconStreamsWired(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    fill: "none",
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M13.5 1a1.5 1.5 0 1 1-1.413 2H11.5A1.5 1.5 0 0 0 10 4.5V6a2.49 2.49 0 0 1-.504 1.5H9.5l-.048.06a2.58 2.58 0 0 1-.352.36c-.01.01-.021.017-.032.025a2.496 2.496 0 0 1-.142.108l-.043.03c-.055.036-.11.07-.168.103l-.047.024c-.057.03-.115.06-.175.085-.018.008-.036.014-.055.021A2.475 2.475 0 0 1 7.5 8.5h-.504c.315.418.504.936.504 1.5v1.5A1.5 1.5 0 0 0 9 13h3.087a1.5 1.5 0 1 1 0 1H9a2.5 2.5 0 0 1-2.5-2.5V10A1.5 1.5 0 0 0 5 8.5H3.913a1.5 1.5 0 1 1 0-1H7.5A1.5 1.5 0 0 0 9 6V4.5A2.5 2.5 0 0 1 11.5 2h.587A1.5 1.5 0 0 1 13.5 1Zm0 12a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Zm-11-5.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Zm11-5.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z",
    clipRule: "evenodd"
  }), ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M13.5 6.5a1.5 1.5 0 1 1-1.413 2H9.948c.293-.287.536-.625.714-1h1.425a1.5 1.5 0 0 1 1.413-1Zm0 1a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconStreamsWired;