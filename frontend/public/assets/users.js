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
var EuiIconUsers = function EuiIconUsers(_ref) {
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
  }, title) : null, ___EmotionJSX("g", {
    style: {
      mixBlendMode: 'multiply'
    }
  }, ___EmotionJSX("path", {
    fillRule: "evenodd",
    d: "M8 5c0 .92-.414 1.744-1.067 2.294.29.094.544.202.764.312.31.154.548.312.716.438a3.417 3.417 0 0 1 .26.215l.02.02.008.008.003.003.002.001.001.002c.707-.707.706-.709.706-.709l-.002-.001-.003-.003-.006-.006-.013-.013a2.65 2.65 0 0 0-.1-.093c.137-.07.287-.135.45-.193a2.5 2.5 0 1 1 3.521 0c.31.11.574.246.795.393.274.183.47.374.604.536a2.145 2.145 0 0 1 .222.323l.007.014.004.006.001.003v.001s.001.002-.893.449c0 0-.5-1-2.5-1-.723 0-1.25.13-1.628.297a2 2 0 0 0-.458-.711l-.707.707L8 9S7 8 5 8 2 9 2 9l-.707-.707.001-.002.002-.001.003-.003.008-.008.02-.02.061-.055a4.693 4.693 0 0 1 .914-.599c.22-.11.476-.217.765-.31A3 3 0 1 1 8 5ZM5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8-1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
    clipRule: "evenodd"
  }), ___EmotionJSX("path", {
    d: "m1.293 8.293.092.092L2 9l-1 4h8L8 9a1643.293 1643.293 0 0 1 .707-.707 1 1 0 0 1 .263.464l1 4A1 1 0 0 1 9 14H1a1 1 0 0 1-.97-1.242l1-4a1 1 0 0 1 .263-.465ZM14 9l.894-.447c.033.065.058.134.076.204l1 4A1 1 0 0 1 15 14h-4.268A2 2 0 0 0 11 13h4l-1-4Z"
  })));
};
export var icon = EuiIconUsers;