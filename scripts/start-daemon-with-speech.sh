#!/bin/bash

export PASEO_DICTATION_ENABLED=true
export PASEO_DICTATION_STT_PROVIDER=local
export PASEO_DICTATION_LOCAL_STT_MODEL=paraformer-zh-int8

npm run cli -- daemon restart