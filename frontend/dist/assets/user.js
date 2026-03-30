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
var EuiIconUser = function EuiIconUser(_ref) {
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
    d: "M3.293 9.293 4 10l-1 4h10l-1-4 .707-.707a1 1 0 0 1 .263.464l1 4A1 1 0 0 1 13 15H3a1 1 0 0 1-.97-1.242l1-4a1 1 0 0 1 .263-.465ZM8 9c3 0 4 1 4 1 .707-.707.706-.708.706-.708l-.001-.001-.002-.002-.005-.005-.01-.01a1.798 1.798 0 0 0-.101-.089 2.907 2.907 0 0 0-.235-.173 4.66 4.66 0 0 0-.856-.44 7.11 7.11 0 0 0-1.136-.342 4 4 0 1 0-4.72 0 7.11 7.11 0 0 0-1.136.342 4.66 4.66 0 0 0-.856.44 2.909 2.909 0 0 0-.335.262l-.011.01-.005.005-.002.002h-.001S3.293 9.294 4 10c0 0 1-1 4-1Zm0-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    clipRule: "evenodd"
  }));
};
export var icon = EuiIconUser;