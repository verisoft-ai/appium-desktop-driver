## [1.8.0](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.7.2...v1.8.0) (2026-07-14)

### Features

* add get window handles with extra information ([58a60ba](https://github.com/verisoft-ai/appium-desktop-driver/commit/58a60ba328f0697ab2e0deaeef59f9ca7e8f1800))
* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add support for switch to iframe - classic IE ([cff7e17](https://github.com/verisoft-ai/appium-desktop-driver/commit/cff7e174decfa245fb591c02f7bd26124bb1cf88))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* bundle IE driver to avoid download ([96f53bf](https://github.com/verisoft-ai/appium-desktop-driver/commit/96f53bf16ed234fa659d1828736e49a8e31d8013))
* **ie:** allow IE lazy start on window switch ([5578d11](https://github.com/verisoft-ai/appium-desktop-driver/commit/5578d1136bb7f69e125e0d035765f3eae558a6b2))
* **jab:** add STA message-pump thread for Java Access Bridge ([4df8fe1](https://github.com/verisoft-ai/appium-desktop-driver/commit/4df8fe14911dc8d328349acca227537ef9b778e0))
* **javaswing:** first implementation ([2643e75](https://github.com/verisoft-ai/appium-desktop-driver/commit/2643e75012a74cdebfcc665f8f8c89b9ded4a5c2))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* preview 22 getNativeChildren command ([a9ddafe](https://github.com/verisoft-ai/appium-desktop-driver/commit/a9ddafefa7322098e8eec642f4ac1a541bbe9da1))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))
* virtual items, select/expand fix ([8ac2ea7](https://github.com/verisoft-ai/appium-desktop-driver/commit/8ac2ea7823bd111d4c8814a773e240ce2714a951))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add css selector ([bc2105b](https://github.com/verisoft-ai/appium-desktop-driver/commit/bc2105babf2d1dd9ff6a3f5902e62d5482b8078d))
* add dialog ([6272a63](https://github.com/verisoft-ai/appium-desktop-driver/commit/6272a636977194c8eb782eb436e482a4febc3e4f))
* add error dialog ([56277c3](https://github.com/verisoft-ai/appium-desktop-driver/commit/56277c3bcd327b481c7681343e3daabc3a7a3413))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* add js script for clicking ([06f02cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/06f02cc9aed2984b642e2c4a9668ef65d5bf70e4))
* add path back to root (switch_to_window('root')) ([64be733](https://github.com/verisoft-ai/appium-desktop-driver/commit/64be73370ebf7b42dc9585ede35000844742d60b))
* add try catch for el.type on click() ([3fa22fb](https://github.com/verisoft-ai/appium-desktop-driver/commit/3fa22fb113f6bea2d079a60dc0f6ff0694b83fd4))
* assignment not used PR review ([e722499](https://github.com/verisoft-ai/appium-desktop-driver/commit/e7224990f1a7a872fa574f781805fc1daac1b7ed))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* change build process dependencies ([20e2d4a](https://github.com/verisoft-ai/appium-desktop-driver/commit/20e2d4a87902dced4440c1177c0c55451e7958ef))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* clean expand fallbacks, keep simple ALT + DOWN with set focus and click ([1adbf26](https://github.com/verisoft-ai/appium-desktop-driver/commit/1adbf26bb818012a95106bcd8ad4b3555b497108))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* find all css IE BRIDGE ([01985e3](https://github.com/verisoft-ai/appium-desktop-driver/commit/01985e3b091aa622c4b8fb50bfe6567b173dbb21))
* find elements xpath and css ([9f82412](https://github.com/verisoft-ai/appium-desktop-driver/commit/9f82412d3fc46f44dfbbd3a67d42f63de7c23757))
* fix scroll direction ([acf907a](https://github.com/verisoft-ai/appium-desktop-driver/commit/acf907a9705cdabc4a1106245a14f45bf0cafba0))
* get window handles and allow Hebrew title in switch window by title ([2d97ab6](https://github.com/verisoft-ai/appium-desktop-driver/commit/2d97ab6ff07e680f9f4a5b6f86bf701c4a695e81))
* getNativeChildren no such element fix ([2dd5ca7](https://github.com/verisoft-ai/appium-desktop-driver/commit/2dd5ca77024b27f3142ed2f7165616168a333499))
* getText ([f27880a](https://github.com/verisoft-ai/appium-desktop-driver/commit/f27880a6b27e45193ae9ed2c399c092236d53b8e))
* ie bridge loggin ([09ac558](https://github.com/verisoft-ai/appium-desktop-driver/commit/09ac558e2d13c836e39aa54711813a4adfb7b840))
* **ie:** detect IE window by IEFrame class name instead of process name ([946e0fc](https://github.com/verisoft-ai/appium-desktop-driver/commit/946e0fc07ddc1095f1caa0faa9a84b010699a9ba))
* implement fallback expand pattern not supported ([7e3398a](https://github.com/verisoft-ai/appium-desktop-driver/commit/7e3398a857e9906a41c0608cd557aa9199a14c90))
* implement ie-bridge ([dfef390](https://github.com/verisoft-ai/appium-desktop-driver/commit/dfef3907470660f29dc0dc8f1e101ce69551149c))
* **invoke:** fall back to LegacyIIAccessiblePattern when InvokePattern QI fails ([31c1a0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/31c1a0ed92288e4158eb1aa12af06f3825762c45))
* JAB path remove gate check expand ([130e347](https://github.com/verisoft-ai/appium-desktop-driver/commit/130e3479d71bf7ab42158cde20a7bffff1a09595))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* Java element finding, setForeground fallbacks, ([1a44b2b](https://github.com/verisoft-ai/appium-desktop-driver/commit/1a44b2b7fa4c5b82e7c00de93533c6f631a1fa84))
* **java-agent:** restore window root fallback for Java 9+ JVMs ([495fda1](https://github.com/verisoft-ai/appium-desktop-driver/commit/495fda1923d6e706c5209b21b79c0cc1ed3cb35a))
* mark element and locate element ([1127048](https://github.com/verisoft-ai/appium-desktop-driver/commit/11270489eadec754cbb03ffd474503c381f06787))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* **mcp:** introduce system prompt in mcp and clarify descriptions ([db645f8](https://github.com/verisoft-ai/appium-desktop-driver/commit/db645f863d7a083b9db956589363d614837a2c1b))
* **mcp:** return error on element not found and fix get attribute searilizing ([0cd3506](https://github.com/verisoft-ai/appium-desktop-driver/commit/0cd3506acf4eacee623cd81221286e6ce8b97eb2))
* new solution for expand element, add custom test app for dropdown and require promp in vision command ([99f531c](https://github.com/verisoft-ai/appium-desktop-driver/commit/99f531c16d8e60c7c3dac4951605f4656921d771))
* package ie bridge ([98c32a6](https://github.com/verisoft-ai/appium-desktop-driver/commit/98c32a6a12780b1ae6a47ab282e70b220e401e68))
* protect java agent from NullPointerException ([f9d08d8](https://github.com/verisoft-ai/appium-desktop-driver/commit/f9d08d8324cba270dcd8bffe7780b4b94f8b1cd1))
* reintroduce semantic release ([3c804b1](https://github.com/verisoft-ai/appium-desktop-driver/commit/3c804b199aca0e61b28625ec12195a57c79f15b7))
* remove sku, fixes pop up demanding .NET ([9915ed6](https://github.com/verisoft-ai/appium-desktop-driver/commit/9915ed6bab153a54f4994ccc00870efe6e94cd48))
* replace document evaluate in xpath ie-bridge ([8f9031d](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f9031d99ed50054f0c995b74004bf5e990ed092))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* retry mechanism ie bridge find elements ([ad2ece5](https://github.com/verisoft-ai/appium-desktop-driver/commit/ad2ece52e1be80b9ff706b03bda52e576f6e7f19))
* start ie server on session launch ([65d3791](https://github.com/verisoft-ai/appium-desktop-driver/commit/65d3791c3fb3f6cb23879c947b186ec56063ba60))
* start ie server on window attach on session start ([b065e0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/b065e0e3f8c6c99727c76fde5addea0c15e35fd1))
* throw error when deleting unexisting file/folder ([7258d85](https://github.com/verisoft-ai/appium-desktop-driver/commit/7258d8508e955b257a7134ce23adebe6a3fe3847))
* trick to set foreground ([e2b0205](https://github.com/verisoft-ai/appium-desktop-driver/commit/e2b02050dc55bbb68e7ade704babbff80cc0f2dc))
* try ([f1e9b8c](https://github.com/verisoft-ai/appium-desktop-driver/commit/f1e9b8cd8e54e35c6219d27d17f6f6b1f9af1c85))
* try another solution for element finding ([434a99a](https://github.com/verisoft-ai/appium-desktop-driver/commit/434a99a71022a0487fe90d3f6128535f38bd35cd))
* try fallback strategies for windows: select ([880eef2](https://github.com/verisoft-ai/appium-desktop-driver/commit/880eef2607d345fde3dfab8f631a91f72e979431))
* try js script for element finding ([e0d43d4](https://github.com/verisoft-ai/appium-desktop-driver/commit/e0d43d4b5545b58dad476074675c441e7d7f5163))
* try new solution find_elements ([b003816](https://github.com/verisoft-ai/appium-desktop-driver/commit/b0038165bbc1eafab50cd98e4814370d8767d413))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* use JS sourceIndex for element identity in IE bridge ([0a23741](https://github.com/verisoft-ai/appium-desktop-driver/commit/0a23741bb4ffc77ecae2fe3d320cdb94f27df533))
* use uniqueId from IE ([47e36a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/47e36a168c64df66c670b8c98327e72fa52c9257))
* walk all element in page source - ie mode ([e3fc5d5](https://github.com/verisoft-ai/appium-desktop-driver/commit/e3fc5d5ed544866f45bafb7cdcc40515b8d05f8a))
* **webview:** Chrome CDP context switching and window attachment bugs ([8fafd5b](https://github.com/verisoft-ai/appium-desktop-driver/commit/8fafd5b8de7265b7cdb0a9455926f1e8a2948898))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))
* **xpath:** fix no runtime id error when searching for XPATH ([e910c53](https://github.com/verisoft-ai/appium-desktop-driver/commit/e910c53985e210b785c8e1f5e31e731bab242e00))

### Miscellaneous Chores

* bump version ([c8ba4c1](https://github.com/verisoft-ai/appium-desktop-driver/commit/c8ba4c1ab2393d1f94a7271c2d19bed32c34e2f6))
* bump version ([a1026a8](https://github.com/verisoft-ai/appium-desktop-driver/commit/a1026a889c2f5fb41e606b1e82cb7d5351dcca12))
* bump version ([c020a9f](https://github.com/verisoft-ai/appium-desktop-driver/commit/c020a9f3508ce7a814d91f1fb08da63c2a47d5fb))
* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* gitignore ie bridge executable ([ad5875c](https://github.com/verisoft-ai/appium-desktop-driver/commit/ad5875cf0e3257c573dd639e27dc9afc155e163a))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* preview 20 ([346ff49](https://github.com/verisoft-ai/appium-desktop-driver/commit/346ff49e01e85e06132952311b700038ce8ac5cd))
* **release:** 1.7.2-preview.1 [skip ci] ([64bb73d](https://github.com/verisoft-ai/appium-desktop-driver/commit/64bb73d2868108e8a132c74a2cec95d2f055bd3b))
* **release:** 1.8.0-preview.1 [skip ci] ([648e6a2](https://github.com/verisoft-ai/appium-desktop-driver/commit/648e6a2cdd303692c6cb8f72652007aa2abbc330))
* **release:** 2.1.0-preview.2 [skip ci] ([b2b09b5](https://github.com/verisoft-ai/appium-desktop-driver/commit/b2b09b57350131363a345534fab2a751f0b225ad))
* **release:** 2.1.0-preview.3 [skip ci] ([25fced1](https://github.com/verisoft-ai/appium-desktop-driver/commit/25fced1c96d12e98a43727aa00e2c0e5f70a1aba))
* **release:** 2.1.0-preview.4 [skip ci] ([a402141](https://github.com/verisoft-ai/appium-desktop-driver/commit/a4021414400c80d4940518393ad5c3454f894b6f))
* **release:** 2.1.0-preview.5 [skip ci] ([872723c](https://github.com/verisoft-ai/appium-desktop-driver/commit/872723cf91a27d71704867593c5fcc7935e96cf8))
* **release:** 2.1.0-preview.6 [skip ci] ([abd03c0](https://github.com/verisoft-ai/appium-desktop-driver/commit/abd03c0278dd8fc589d028275176b9cae3fe19d9))
* **release:** 2.1.0-preview.6 [skip ci] ([9230c9f](https://github.com/verisoft-ai/appium-desktop-driver/commit/9230c9f86830f8d085d565d69b545cda8fc251c7))
* **release:** 2.1.0-preview.6 [skip ci] ([041941f](https://github.com/verisoft-ai/appium-desktop-driver/commit/041941fa7b14d016567b8813cde23039d506f96c))
* **release:** 2.1.0-preview.6 [skip ci] ([b4b26c1](https://github.com/verisoft-ai/appium-desktop-driver/commit/b4b26c1a45eb62513fe373fa0df8be3960363084))
* **release:** 2.1.0-preview.6 [skip ci] ([292fa12](https://github.com/verisoft-ai/appium-desktop-driver/commit/292fa12fb8b14ffafc880e0707ac304f20097654))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))
* **release:** run release workflow on windows machine ([ca74226](https://github.com/verisoft-ai/appium-desktop-driver/commit/ca74226dd827acff8689ba819fec46ea23b34ed6))
* remove IEBridge from git cache ([701439b](https://github.com/verisoft-ai/appium-desktop-driver/commit/701439b55f45fcb39a524bffd22d2ce326930236))
* SKIP_CI remove unused release-lite and claude workflows ([03b244e](https://github.com/verisoft-ai/appium-desktop-driver/commit/03b244e83f3cfeab463a4382a2cafd3c35013a35))
* trigger publish on develop ([2e0123f](https://github.com/verisoft-ai/appium-desktop-driver/commit/2e0123faf5de734874f62fe16280b4e86557d7ac))
* untrack .claude and .vscode, add to .gitignore ([76e24dd](https://github.com/verisoft-ai/appium-desktop-driver/commit/76e24dd4738efa4a06bc09def3d5ffc5935e832a))

### Code Refactoring

* **ie:** remove dead process-name detection code ([93dc3cd](https://github.com/verisoft-ai/appium-desktop-driver/commit/93dc3cd9315173dfc13fb6a2cc2e469790f05355))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-30)

### Features

* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* bundle IE driver to avoid download ([96f53bf](https://github.com/verisoft-ai/appium-desktop-driver/commit/96f53bf16ed234fa659d1828736e49a8e31d8013))
* **ie:** allow IE lazy start on window switch ([5578d11](https://github.com/verisoft-ai/appium-desktop-driver/commit/5578d1136bb7f69e125e0d035765f3eae558a6b2))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))
* virtual items, select/expand fix ([8ac2ea7](https://github.com/verisoft-ai/appium-desktop-driver/commit/8ac2ea7823bd111d4c8814a773e240ce2714a951))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* add path back to root (switch_to_window('root')) ([64be733](https://github.com/verisoft-ai/appium-desktop-driver/commit/64be73370ebf7b42dc9585ede35000844742d60b))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* get window handles and allow Hebrew title in switch window by title ([2d97ab6](https://github.com/verisoft-ai/appium-desktop-driver/commit/2d97ab6ff07e680f9f4a5b6f86bf701c4a695e81))
* getText ([f27880a](https://github.com/verisoft-ai/appium-desktop-driver/commit/f27880a6b27e45193ae9ed2c399c092236d53b8e))
* **ie:** detect IE window by IEFrame class name instead of process name ([946e0fc](https://github.com/verisoft-ai/appium-desktop-driver/commit/946e0fc07ddc1095f1caa0faa9a84b010699a9ba))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* **mcp:** return error on element not found and fix get attribute searilizing ([0cd3506](https://github.com/verisoft-ai/appium-desktop-driver/commit/0cd3506acf4eacee623cd81221286e6ce8b97eb2))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* start ie server on session launch ([65d3791](https://github.com/verisoft-ai/appium-desktop-driver/commit/65d3791c3fb3f6cb23879c947b186ec56063ba60))
* start ie server on window attach on session start ([b065e0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/b065e0e3f8c6c99727c76fde5addea0c15e35fd1))
* trick to set foreground ([e2b0205](https://github.com/verisoft-ai/appium-desktop-driver/commit/e2b02050dc55bbb68e7ade704babbff80cc0f2dc))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))
* **xpath:** fix no runtime id error when searching for XPATH ([e910c53](https://github.com/verisoft-ai/appium-desktop-driver/commit/e910c53985e210b785c8e1f5e31e731bab242e00))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([9230c9f](https://github.com/verisoft-ai/appium-desktop-driver/commit/9230c9f86830f8d085d565d69b545cda8fc251c7))
* **release:** 2.1.0-preview.6 [skip ci] ([041941f](https://github.com/verisoft-ai/appium-desktop-driver/commit/041941fa7b14d016567b8813cde23039d506f96c))
* **release:** 2.1.0-preview.6 [skip ci] ([b4b26c1](https://github.com/verisoft-ai/appium-desktop-driver/commit/b4b26c1a45eb62513fe373fa0df8be3960363084))
* **release:** 2.1.0-preview.6 [skip ci] ([292fa12](https://github.com/verisoft-ai/appium-desktop-driver/commit/292fa12fb8b14ffafc880e0707ac304f20097654))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

### Code Refactoring

* **ie:** remove dead process-name detection code ([93dc3cd](https://github.com/verisoft-ai/appium-desktop-driver/commit/93dc3cd9315173dfc13fb6a2cc2e469790f05355))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-30)

### Features

* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* **ie:** allow IE lazy start on window switch ([5578d11](https://github.com/verisoft-ai/appium-desktop-driver/commit/5578d1136bb7f69e125e0d035765f3eae558a6b2))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))
* virtual items, select/expand fix ([8ac2ea7](https://github.com/verisoft-ai/appium-desktop-driver/commit/8ac2ea7823bd111d4c8814a773e240ce2714a951))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* add path back to root (switch_to_window('root')) ([64be733](https://github.com/verisoft-ai/appium-desktop-driver/commit/64be73370ebf7b42dc9585ede35000844742d60b))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* get window handles and allow Hebrew title in switch window by title ([2d97ab6](https://github.com/verisoft-ai/appium-desktop-driver/commit/2d97ab6ff07e680f9f4a5b6f86bf701c4a695e81))
* getText ([f27880a](https://github.com/verisoft-ai/appium-desktop-driver/commit/f27880a6b27e45193ae9ed2c399c092236d53b8e))
* **ie:** detect IE window by IEFrame class name instead of process name ([946e0fc](https://github.com/verisoft-ai/appium-desktop-driver/commit/946e0fc07ddc1095f1caa0faa9a84b010699a9ba))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* **mcp:** return error on element not found and fix get attribute searilizing ([0cd3506](https://github.com/verisoft-ai/appium-desktop-driver/commit/0cd3506acf4eacee623cd81221286e6ce8b97eb2))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* start ie server on session launch ([65d3791](https://github.com/verisoft-ai/appium-desktop-driver/commit/65d3791c3fb3f6cb23879c947b186ec56063ba60))
* start ie server on window attach on session start ([b065e0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/b065e0e3f8c6c99727c76fde5addea0c15e35fd1))
* trick to set foreground ([e2b0205](https://github.com/verisoft-ai/appium-desktop-driver/commit/e2b02050dc55bbb68e7ade704babbff80cc0f2dc))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))
* **xpath:** fix no runtime id error when searching for XPATH ([e910c53](https://github.com/verisoft-ai/appium-desktop-driver/commit/e910c53985e210b785c8e1f5e31e731bab242e00))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([041941f](https://github.com/verisoft-ai/appium-desktop-driver/commit/041941fa7b14d016567b8813cde23039d506f96c))
* **release:** 2.1.0-preview.6 [skip ci] ([b4b26c1](https://github.com/verisoft-ai/appium-desktop-driver/commit/b4b26c1a45eb62513fe373fa0df8be3960363084))
* **release:** 2.1.0-preview.6 [skip ci] ([292fa12](https://github.com/verisoft-ai/appium-desktop-driver/commit/292fa12fb8b14ffafc880e0707ac304f20097654))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

### Code Refactoring

* **ie:** remove dead process-name detection code ([93dc3cd](https://github.com/verisoft-ai/appium-desktop-driver/commit/93dc3cd9315173dfc13fb6a2cc2e469790f05355))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-27)

### Features

* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* **ie:** allow IE lazy start on window switch ([5578d11](https://github.com/verisoft-ai/appium-desktop-driver/commit/5578d1136bb7f69e125e0d035765f3eae558a6b2))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))
* virtual items, select/expand fix ([8ac2ea7](https://github.com/verisoft-ai/appium-desktop-driver/commit/8ac2ea7823bd111d4c8814a773e240ce2714a951))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* get window handles and allow Hebrew title in switch window by title ([2d97ab6](https://github.com/verisoft-ai/appium-desktop-driver/commit/2d97ab6ff07e680f9f4a5b6f86bf701c4a695e81))
* **ie:** detect IE window by IEFrame class name instead of process name ([946e0fc](https://github.com/verisoft-ai/appium-desktop-driver/commit/946e0fc07ddc1095f1caa0faa9a84b010699a9ba))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* start ie server on session launch ([65d3791](https://github.com/verisoft-ai/appium-desktop-driver/commit/65d3791c3fb3f6cb23879c947b186ec56063ba60))
* start ie server on window attach on session start ([b065e0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/b065e0e3f8c6c99727c76fde5addea0c15e35fd1))
* trick to set foreground ([e2b0205](https://github.com/verisoft-ai/appium-desktop-driver/commit/e2b02050dc55bbb68e7ade704babbff80cc0f2dc))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))
* **xpath:** fix no runtime id error when searching for XPATH ([e910c53](https://github.com/verisoft-ai/appium-desktop-driver/commit/e910c53985e210b785c8e1f5e31e731bab242e00))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([b4b26c1](https://github.com/verisoft-ai/appium-desktop-driver/commit/b4b26c1a45eb62513fe373fa0df8be3960363084))
* **release:** 2.1.0-preview.6 [skip ci] ([292fa12](https://github.com/verisoft-ai/appium-desktop-driver/commit/292fa12fb8b14ffafc880e0707ac304f20097654))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

### Code Refactoring

* **ie:** remove dead process-name detection code ([93dc3cd](https://github.com/verisoft-ai/appium-desktop-driver/commit/93dc3cd9315173dfc13fb6a2cc2e469790f05355))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-24)

### Features

* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* **ie:** allow IE lazy start on window switch ([5578d11](https://github.com/verisoft-ai/appium-desktop-driver/commit/5578d1136bb7f69e125e0d035765f3eae558a6b2))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* get window handles and allow Hebrew title in switch window by title ([2d97ab6](https://github.com/verisoft-ai/appium-desktop-driver/commit/2d97ab6ff07e680f9f4a5b6f86bf701c4a695e81))
* **ie:** detect IE window by IEFrame class name instead of process name ([946e0fc](https://github.com/verisoft-ai/appium-desktop-driver/commit/946e0fc07ddc1095f1caa0faa9a84b010699a9ba))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* trick to set foreground ([e2b0205](https://github.com/verisoft-ai/appium-desktop-driver/commit/e2b02050dc55bbb68e7ade704babbff80cc0f2dc))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))
* **xpath:** fix no runtime id error when searching for XPATH ([e910c53](https://github.com/verisoft-ai/appium-desktop-driver/commit/e910c53985e210b785c8e1f5e31e731bab242e00))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([292fa12](https://github.com/verisoft-ai/appium-desktop-driver/commit/292fa12fb8b14ffafc880e0707ac304f20097654))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

### Code Refactoring

* **ie:** remove dead process-name detection code ([93dc3cd](https://github.com/verisoft-ai/appium-desktop-driver/commit/93dc3cd9315173dfc13fb6a2cc2e469790f05355))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-23)

### Features

* add iexplorer.exe selenium driver server proxy ([0e678cc](https://github.com/verisoft-ai/appium-desktop-driver/commit/0e678cc433cf3e1943169ef7a295e07303570fd4))
* add jdkPath capability ([5b3b727](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3b7276e8e82621555100c27d7a23851a7494b7))
* add switch window by title script ([b04cd84](https://github.com/verisoft-ai/appium-desktop-driver/commit/b04cd84052574111bd5a71e68f973f2f238947cb))
* apply thread process id strategy to set foreground ([9b268e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/9b268e8afef7f8eda18ca17d5ad39bbd6b8891bf))
* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* **mcp:** add mcp support for java tools ([484aa0c](https://github.com/verisoft-ai/appium-desktop-driver/commit/484aa0c3b5f318e0705b7ff7281d8da7d610c149))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* java detection bug ([f567428](https://github.com/verisoft-ai/appium-desktop-driver/commit/f56742817c7e646cd7c58b6edef79785a006e1a9))
* **mcp:** appium close session timeout ([348e88c](https://github.com/verisoft-ai/appium-desktop-driver/commit/348e88c902fb6569ea497681695279d486b1a7a5))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))
* xpath java swing and add end to end tests ([6692957](https://github.com/verisoft-ai/appium-desktop-driver/commit/66929573adda8c343ab42fab2015f154a1035694))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([49ffddc](https://github.com/verisoft-ai/appium-desktop-driver/commit/49ffddcf023cbe31eee556395130cb10dd48a3e7))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-17)

### Features

* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* add expand/collapse end to end tests and improve window attachment on start of session ([db562ea](https://github.com/verisoft-ai/appium-desktop-driver/commit/db562ea8f9544aafe33d110c484f57c3f8eff1f2))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* clean env before injecting java agent, improve diagnostics ([1ec5cb7](https://github.com/verisoft-ai/appium-desktop-driver/commit/1ec5cb7ca935460724ed857f3bcf2be5b2745fa8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([8f24d00](https://github.com/verisoft-ai/appium-desktop-driver/commit/8f24d00caa5c0e91861c30ced6bb47bd4fe2dd15))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-17)

### Features

* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([91e34d0](https://github.com/verisoft-ai/appium-desktop-driver/commit/91e34d012c15c251bdae88c163f09ebef382a18d))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))
* **release:** 2.1.0-preview.8 [skip ci] ([be2e60a](https://github.com/verisoft-ai/appium-desktop-driver/commit/be2e60a1f3ab19c7263dab823525375414ef0814))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-17)

### Features

* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* improve java swing examples ([980b4d6](https://github.com/verisoft-ai/appium-desktop-driver/commit/980b4d6b77535d9c7df86e71713815a211b1f6e1))
* **release:** 2.1.0-preview.6 [skip ci] ([28c8384](https://github.com/verisoft-ai/appium-desktop-driver/commit/28c8384391433fe27abdc7f0f648ccba562d613c))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-17)

### Features

* make java agent attachable to ongoing session ([7dfc414](https://github.com/verisoft-ai/appium-desktop-driver/commit/7dfc41445ae1ca2926d951087165a608be620a41))
* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* **release:** 2.1.0-preview.6 [skip ci] ([4af853a](https://github.com/verisoft-ai/appium-desktop-driver/commit/4af853a2b2d68833a09c9fb45381dab3405e671f))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-12)

### Features

* replace Java Access Bridge with JVM agent for Swing automation ([ef6b3a1](https://github.com/verisoft-ai/appium-desktop-driver/commit/ef6b3a1a493fba18ee0ca146d65e58da915182ad))

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* bind socket to 127.0.0.1 to avoid windows fireawall ([91f56a5](https://github.com/verisoft-ai/appium-desktop-driver/commit/91f56a54c61370de41b86b9a2691aa678379b151))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))
* replace TransformPattern check with ClassName filter for CoreWindow ([042851b](https://github.com/verisoft-ai/appium-desktop-driver/commit/042851ba091c99024950480937694eb1835519eb))
* use java 8 semantics ([4d1fec7](https://github.com/verisoft-ai/appium-desktop-driver/commit/4d1fec71899f95b01cc20b2bf4bbf3ad1918ba96))

### Miscellaneous Chores

* fix end to end workflow [skip ci] ([ea8c4cf](https://github.com/verisoft-ai/appium-desktop-driver/commit/ea8c4cfb12cb3fff238541e6b33adefdcaa8af4b))
* **release:** 2.1.0-preview.6 [skip ci] ([67dc1e2](https://github.com/verisoft-ai/appium-desktop-driver/commit/67dc1e2c3434ffa0c26a91e8440f8acbdbb740bd))
* **release:** 2.1.0-preview.6 [skip ci] ([4171032](https://github.com/verisoft-ai/appium-desktop-driver/commit/41710321f15e38741bd55b5c0698b193c3882ca4))
* **release:** 2.1.0-preview.6 [skip ci] ([8c29576](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c29576f033b50adc36e4ae9be18aed439c02ec0))
* **release:** 2.1.0-preview.7 [skip ci] ([1b64455](https://github.com/verisoft-ai/appium-desktop-driver/commit/1b644550be2ec1668070a94c5fefa3b021bc0cd3))

## [2.1.0-preview.7](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.6...v2.1.0-preview.7) (2026-06-11)

### Miscellaneous Chores

* fix release pipeline git history fetch ([6a0c48e](https://github.com/verisoft-ai/appium-desktop-driver/commit/6a0c48e))

## [2.1.0-preview.6](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.5...v2.1.0-preview.6) (2026-06-11)

### Bug Fixes

* **actions:** re-implement tick based action sequence ([17b2f0d](https://github.com/verisoft-ai/appium-desktop-driver/commit/17b2f0d1fbc28efc2cb85f2d96f455b1982746e8))
* correct setWindow and MCP window pattern tools ([a722b8d](https://github.com/verisoft-ai/appium-desktop-driver/commit/a722b8d2797f4e0eed645221e8c22ccc15fde299))
* **jab:** interact with jab elements ([ab8247f](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab8247fb63491c24c9c5d77d3e35627891906081))

## [2.1.0-preview.5](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.4...v2.1.0-preview.5) (2026-06-09)

### Miscellaneous Chores

* **release:** run release workflow on windows machine ([ca74226](https://github.com/verisoft-ai/appium-desktop-driver/commit/ca74226dd827acff8689ba819fec46ea23b34ed6))

## [2.1.0-preview.4](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.3...v2.1.0-preview.4) (2026-06-09)

### Miscellaneous Chores

* SKIP_CI remove unused release-lite and claude workflows ([03b244e](https://github.com/verisoft-ai/appium-desktop-driver/commit/03b244e83f3cfeab463a4382a2cafd3c35013a35))

## [2.1.0-preview.3](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.2...v2.1.0-preview.3) (2026-06-09)

### Bug Fixes

* **invoke:** fall back to LegacyIIAccessiblePattern when InvokePattern QI fails ([31c1a0e](https://github.com/verisoft-ai/appium-desktop-driver/commit/31c1a0ed92288e4158eb1aa12af06f3825762c45))
* **mcp:** introduce system prompt in mcp and clarify descriptions ([db645f8](https://github.com/verisoft-ai/appium-desktop-driver/commit/db645f863d7a083b9db956589363d614837a2c1b))
* throw error when deleting unexisting file/folder ([7258d85](https://github.com/verisoft-ai/appium-desktop-driver/commit/7258d8508e955b257a7134ce23adebe6a3fe3847))

## [2.1.0-preview.2](https://github.com/verisoft-ai/appium-desktop-driver/compare/v2.1.0-preview.1...v2.1.0-preview.2) (2026-06-08)

### Miscellaneous Chores

* untrack .claude and .vscode, add to .gitignore ([76e24dd](https://github.com/verisoft-ai/appium-desktop-driver/commit/76e24dd4738efa4a06bc09def3d5ffc5935e832a))

## [1.8.0-preview.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.7.2-preview.1...v1.8.0-preview.1) (2026-06-07)

### Features

* **jab:** add STA message-pump thread for Java Access Bridge ([4df8fe1](https://github.com/verisoft-ai/appium-desktop-driver/commit/4df8fe14911dc8d328349acca227537ef9b778e0))
* **javaswing:** first implementation ([2643e75](https://github.com/verisoft-ai/appium-desktop-driver/commit/2643e75012a74cdebfcc665f8f8c89b9ded4a5c2))

## [1.7.2-preview.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.7.1...v1.7.2-preview.1) (2026-05-27)

### Bug Fixes

* **webview:** Chrome CDP context switching and window attachment bugs ([8fafd5b](https://github.com/verisoft-ai/appium-desktop-driver/commit/8fafd5b8de7265b7cdb0a9455926f1e8a2948898))

### Miscellaneous Chores

* trigger publish on develop ([2e0123f](https://github.com/verisoft-ai/appium-desktop-driver/commit/2e0123faf5de734874f62fe16280b4e86557d7ac))

## [1.7.2](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.7.1...v1.7.2) (2026-05-28)

### Bug Fixes

* handle SetFocus failure during session attachment ([ab67483](https://github.com/verisoft-ai/appium-desktop-driver/commit/ab67483b628a6283084ab2a823df88d214b28312))

## [1.7.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.7.0...v1.7.1) (2026-05-23)

### Miscellaneous Chores

* remove powershell insecure check - alway allow ([2225b79](https://github.com/verisoft-ai/appium-desktop-driver/commit/2225b79fc9972f0000ff6a3982b6f993506baca5))

## [1.7.0](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.6.1...v1.7.0) (2026-05-04)

### Features

* add analyze_screen mcp tool ([5c6b998](https://github.com/verisoft-ai/appium-desktop-driver/commit/5c6b998ebde79caa9f05261f252be3fcba847edd))
* lazy load mcp server ([16a1533](https://github.com/verisoft-ai/appium-desktop-driver/commit/16a15337daacf2a2088f9eb4ee548a5cb03dce71))

### Bug Fixes

* remove last residuals of nova windows logs ([5b3627f](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b3627fef8bb40d2cdb640f0956dfe5c254cfb57))

## [1.6.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.6.0...v1.6.1) (2026-04-23)

### Bug Fixes

* check amazon user and key ([4f45cf1](https://github.com/verisoft-ai/appium-desktop-driver/commit/4f45cf1ad1a16a6d2412902be1dcfd8a899b1493))
* **vision:** make model argument mandatory in find_by_vision and executeFindByVision ([2eee54c](https://github.com/verisoft-ai/appium-desktop-driver/commit/2eee54cfa7fec16975f7ad748fe3fa4462bc9709))

## [1.6.0](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.5.1...v1.6.0) (2026-04-15)

### Features

* **vision:** add extra llm support for vision command. ([4055904](https://github.com/verisoft-ai/appium-desktop-driver/commit/40559042ff5e730e84a155c925da71834c220dcd))

### Bug Fixes

* **vision:** address multi-provider review findings ([9c8a8ff](https://github.com/verisoft-ai/appium-desktop-driver/commit/9c8a8ff366bff7b3d9a047d3e09298f044d62aaf))

## [1.5.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.5.0...v1.5.1) (2026-04-13)

### Bug Fixes

* **actions:** Action execution according to W3C definition. ([8c9019d](https://github.com/verisoft-ai/appium-desktop-driver/commit/8c9019dc39841ec7f61d8770042db72355975d5f))
* fix json element rect unexpected end error ([8d1498f](https://github.com/verisoft-ai/appium-desktop-driver/commit/8d1498f3dc667e017e3f8ed4d409ec60e3fea72a))
* fix release actions tracking pressed mouse buttons ([0309ab0](https://github.com/verisoft-ai/appium-desktop-driver/commit/0309ab0a06c33591bb1d36b23e2dcbdf688d1772))
* **mouse move:** fix silent fail calculating mouse move after scroll into view. ([9e755eb](https://github.com/verisoft-ai/appium-desktop-driver/commit/9e755eb8c5d1ee475d85a8630bab6b583b2a5a8d))
* **release key:** fix handle null key action not iterating over pressed keys ([db18fd8](https://github.com/verisoft-ai/appium-desktop-driver/commit/db18fd8b8884883dc241b2ce5ef104cde2bccf11))

## [1.5.0](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.4.3...v1.5.0) (2026-04-04)

### Features

* add new command 'windows: findByVision' ([26c69aa](https://github.com/verisoft-ai/appium-desktop-driver/commit/26c69aaeed15ff94f9f469b1594bd640772fcf51))
* **mcp:** add analyze_screen tool via agent loop ([0bcbf09](https://github.com/verisoft-ai/appium-desktop-driver/commit/0bcbf0952fbe267e1c2cdc4176dbb722e51cb591))

### Bug Fixes

* account display scaling for precise pixel calculation in analyze_screenshot tool. ([611f345](https://github.com/verisoft-ai/appium-desktop-driver/commit/611f345c957de5361af0c06f0857352ab27ad5ed))
* coordinate mapping with offset calculation ([c68bb4e](https://github.com/verisoft-ai/appium-desktop-driver/commit/c68bb4e7c34b4d39b3472da5ec5f6b566f15cf57))
* correct stale error message in find_by_vision MCP tool ([c82e107](https://github.com/verisoft-ai/appium-desktop-driver/commit/c82e107f7e1b40297e84d34ca2f62ff7b117f669))
* fix mock path vision test ([39b9386](https://github.com/verisoft-ai/appium-desktop-driver/commit/39b9386c80ddcc7ab595317ace4b1f1b9384f519))
* ignore import/no-unresolved for @modelcontextprotocol/sdk subpaths ([688c68c](https://github.com/verisoft-ai/appium-desktop-driver/commit/688c68cdc6d7eb4bf3225dc29d01950b14f94e1d))

### Code Refactoring

* **vision:** unify find_by_vision MCP tool and findByVision command ([276d86f](https://github.com/verisoft-ai/appium-desktop-driver/commit/276d86f68be5e501f4510617442968abcac4db87))

## [1.4.3](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.4.2...v1.4.3) (2026-03-26)

### Miscellaneous Chores

* update website hero and footer attribution [skip ci] ([3a67147](https://github.com/verisoft-ai/appium-desktop-driver/commit/3a67147f89bc5f5400092ee7bc4083c55708dc4a))

### Code Refactoring

* rename driver class from NovaWindowsDriver to AppiumDesktopDriver ([8a1eb39](https://github.com/verisoft-ai/appium-desktop-driver/commit/8a1eb393f48c7ee2d9fc5a17d7f262fa7e8ae596))

## [1.4.2](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.4.1...v1.4.2) (2026-03-24)

### Bug Fixes

* lint ([9832a8e](https://github.com/verisoft-ai/appium-desktop-driver/commit/9832a8eaf025e96f619d4c1b342c3c0909dfb5fa))

### Miscellaneous Chores

* **website:** create website with mcp and driver demos ([5e8e910](https://github.com/verisoft-ai/appium-desktop-driver/commit/5e8e910fc1e69de8a81ec18898b7f0dd28135af6))

## [1.4.1](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.4.0...v1.4.1) (2026-03-23)

### Bug Fixes

* **mcp:** change mcp naming to match new Desktop Driver convention ([e77a7b0](https://github.com/verisoft-ai/appium-desktop-driver/commit/e77a7b02d4ed8769d61697c96c239bb03e3aef61))

## [1.4.0](https://github.com/verisoft-ai/appium-desktop-driver/compare/v1.3.1...v1.4.0) (2026-03-23)

### Features

* **capability:** Add capabilities windowSwitchRetries and windowSwitchInterval ([a831b3a](https://github.com/verisoft-ai/appium-desktop-driver/commit/a831b3af5d8d531a41483f36391d631cd787c371))
* custom env variables capabilities ([6a98b5c](https://github.com/verisoft-ai/appium-desktop-driver/commit/6a98b5c76bdfecf1ef6a893ea9c37abdd5e47c33))
* **display:** add support for multi monitor  testing ([1029aec](https://github.com/verisoft-ai/appium-desktop-driver/commit/1029aec97adb420e9525e1f325c64870dc51585c))
* Implemented missing commands ([4434b99](https://github.com/verisoft-ai/appium-desktop-driver/commit/4434b996fa33cd0214c7cd44073f34806cd1c99f))
* **mcp:** add MCP server with 39 tools and unit test suite ([cf3d464](https://github.com/verisoft-ai/appium-desktop-driver/commit/cf3d464d1b74efbdddb04aa16ff3a19e19564934))

### Bug Fixes

* Add allowed tools to claude code reviewer ([c4c18e9](https://github.com/verisoft-ai/appium-desktop-driver/commit/c4c18e9f35915eb609e41572cb3c5ea15e3314a7))
* add tabbing ([c0cb0e8](https://github.com/verisoft-ai/appium-desktop-driver/commit/c0cb0e8bb4fb37c9f70b8e891c659c56142c1943))
* fix attaching to wrong application window ([8960843](https://github.com/verisoft-ai/appium-desktop-driver/commit/8960843d548c98728880c901b154215b6265b69e))
* fix code review comments ([d7bebd9](https://github.com/verisoft-ai/appium-desktop-driver/commit/d7bebd9ff1660fd065a92e7008344c3b1323bd27))
* **lint:** resolve lint errors ([5b72f12](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b72f122472cdd4e563aa044b1baa2a52af7d10a))
* **mcp:** resolve bugs, add tool annotations, and new UIA tools ([fd73365](https://github.com/verisoft-ai/appium-desktop-driver/commit/fd7336552264a52ad2dda8c28bee2afcf44050a6))
* Remove claude code review workflow ([88f921d](https://github.com/verisoft-ai/appium-desktop-driver/commit/88f921d81ba9b81ff1578b2ac34c81d337670f30))
* Remove outerloops ([92eedfa](https://github.com/verisoft-ai/appium-desktop-driver/commit/92eedfa5decf6125c0f688da2d4c3bcf896491d5))
* replace NovaWindows automation name with DesktopDriver ([dd585b9](https://github.com/verisoft-ai/appium-desktop-driver/commit/dd585b9013fd5b128e10c42af86ca4e5f86f6934))
* **window:** narrow appProcessIds to the attached window's PID ([d281444](https://github.com/verisoft-ai/appium-desktop-driver/commit/d2814445ab5248483d451f1817fbff67d30d7654))
* **window:** track child processes  spawned from launched apps. ([f1e6bff](https://github.com/verisoft-ai/appium-desktop-driver/commit/f1e6bfffe5bfcdebe884de207eabce8381c83a67))
* **window:** window handles access capability added ([eefb804](https://github.com/verisoft-ai/appium-desktop-driver/commit/eefb8040b2ec43795b4c985e42090dad2fa2e6ae))

### Miscellaneous Chores

* bump version to 1.1.0 ([393bdae](https://github.com/verisoft-ai/appium-desktop-driver/commit/393bdaeaa0070385a15a61affe88c059c8967c6a))
* bump version to 1.2.0 ([94a4f04](https://github.com/verisoft-ai/appium-desktop-driver/commit/94a4f046be53c3b804497ad4e1d2782860e25070))
* **claude:** Add constraints and context for claude code review ([e95c6b2](https://github.com/verisoft-ai/appium-desktop-driver/commit/e95c6b219f436dd030f4e7dd840713e651af9cb4))
* **claude:** change constraints for claude code review ([3acee1c](https://github.com/verisoft-ai/appium-desktop-driver/commit/3acee1c1565b575e84f3b087aff6085b6b524229))
* **npm:** Ignore build artifacts and local mcp/claude config ([c9d3529](https://github.com/verisoft-ai/appium-desktop-driver/commit/c9d3529cf1c259d36eaf82e64702fdd080463195))
* prepare package for verisoft npm distribution ([5b35ff7](https://github.com/verisoft-ai/appium-desktop-driver/commit/5b35ff722d8254f24fea2bfe5112f4e0bddfc1e7))
* **release:** bump version and re-added the auto release workflow ([8555903](https://github.com/verisoft-ai/appium-desktop-driver/commit/8555903c4b3038d11fe24c038ef83964f71a1710))
* remove auto publish on push to main ([e940fd1](https://github.com/verisoft-ai/appium-desktop-driver/commit/e940fd1e4f20a505ea81dd668b4240abd2053d7f))

### Code Refactoring

* **mcp:** remove auto-start, require Appium to be running externally ([8b76810](https://github.com/verisoft-ai/appium-desktop-driver/commit/8b76810041db68c960b3448173a8adca52679390))

## [1.3.1](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.3.0...v1.3.1) (2026-03-09)

### Bug Fixes

* add stderr encoding for PowerShell session ([a233063](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a233063b4509e41c047fcc3603b29b944c5ac374))
* fixed incorrect $pattern variable reference ([a0afceb](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a0afceb7e682219b5e82759c52e20c59bff1225f))
* fixed not being able to attach to slow-starting classic apps on session creation ([f25b000](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/f25b000533be1ef2a7c0bc350bf62a3cd1b60a45))

## [1.3.0](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.2.0...v1.3.0) (2026-03-06)

### Features

* **commands:** add extra W3C commands ([57c654a](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/57c654a1e1e43c8a5d31ed8103aba338883efaa9))
* **commands:** add support for close app and launch app ([26db919](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/26db919c17ce74ff3c5ef2776544affecb32e2fc))
* **commands:** implement waitForAppLaunch and forceQuit ([6cce956](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/6cce9565ce51b9f0e354b14819f41a6fc39ffc50))
* **tests:** add unit tests and missing commands - recording, deletion and click and drag ([a8989c0](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a8989c06816b3f9b5b5de82d85895106ab062aca))

### Bug Fixes

* Bind commands to this instance (not prototype) so each driver instance uses its own powershell session ([#56](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/56)) [skip ci] ([6dc2125](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/6dc2125c505b392f100036d532326202c0a9c8d4))
* **capability:** fix post run script ([97b57af](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/97b57af2fe05803ecb66548b8a32202fbe9a45e6))
* **commands:** add allow-insecure check for fs operations ([4662035](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/466203585796fe08fdb4b119991363246cb00dab))
* **commands:** match closeApp and launchApp implementation with appium windows driver ([073c566](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/073c566edb3528380196640eb33ee803b4fe2029))
* fix bugs and implemented end to end tests ([47efa4c](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/47efa4cf00fbac2e15e07e572cdf3e4453ec1020))
* lint ([fb6ebc8](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/fb6ebc83b1ed5c0fd0c5230d2948d4f5cb156b17))
* **lint:** lint ([acf7271](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/acf727179dfe1380d42a33a6d38f5175b22cb90d))
* **recorder:** fix screen recording ([9da1025](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/9da1025c994cb0c3221119690f01a0584b3cf333))
* **recorder:** validate outputPath before rimraf ([8aa49dd](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/8aa49dd27b2b9bb54329efa0555bb5ef21dc36b5))

### Miscellaneous Chores

* **release:** 1.3.0 [skip ci] ([c29b822](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/c29b8223fc6f0435363d6207af0ab1185b811b60))

## [1.3.0](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.2.0...v1.3.0) (2026-03-06)

### Features

* **commands:** add extra W3C commands ([57c654a](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/57c654a1e1e43c8a5d31ed8103aba338883efaa9))
* **commands:** add support for close app and launch app ([26db919](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/26db919c17ce74ff3c5ef2776544affecb32e2fc))
* **commands:** implement waitForAppLaunch and forceQuit ([6cce956](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/6cce9565ce51b9f0e354b14819f41a6fc39ffc50))
* **tests:** add unit tests and missing commands - recording, deletion and click and drag ([a8989c0](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a8989c06816b3f9b5b5de82d85895106ab062aca))

### Bug Fixes

* Bind commands to this instance (not prototype) so each driver instance uses its own powershell session ([#56](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/56)) [skip ci] ([6dc2125](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/6dc2125c505b392f100036d532326202c0a9c8d4))
* **capability:** fix post run script ([97b57af](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/97b57af2fe05803ecb66548b8a32202fbe9a45e6))
* **commands:** add allow-insecure check for fs operations ([4662035](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/466203585796fe08fdb4b119991363246cb00dab))
* **commands:** match closeApp and launchApp implementation with appium windows driver ([073c566](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/073c566edb3528380196640eb33ee803b4fe2029))
* fix bugs and implemented end to end tests ([47efa4c](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/47efa4cf00fbac2e15e07e572cdf3e4453ec1020))
* lint ([fb6ebc8](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/fb6ebc83b1ed5c0fd0c5230d2948d4f5cb156b17))
* **lint:** lint ([acf7271](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/acf727179dfe1380d42a33a6d38f5175b22cb90d))
* **recorder:** fix screen recording ([9da1025](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/9da1025c994cb0c3221119690f01a0584b3cf333))
* **recorder:** validate outputPath before rimraf ([8aa49dd](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/8aa49dd27b2b9bb54329efa0555bb5ef21dc36b5))

## [1.2.0](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.1.0...v1.2.0) (2026-01-09)

### Features

* add "none" session option to start without attaching to any element ([22586a2](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/22586a237f20e975adee25c13fba8c649420574d))
* add appWorkingDir, prerun, postrun, and isolatedScriptExecution capabilities ([5a581ae](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/5a581ae7ae1e1a013cb8e332454f70762f8749c7))

### Bug Fixes

* allow elementId with optional x/y offsets for click/hover ([2d01246](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/2d01246e009e2c7fd67165fc1d313446870021d3))
* **deps:** downgrade appium peer dependency to 3.0.0-rc.2 ([98262d2](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/98262d297268cf40259946e4a52038103618f3b4))
* make modifierKeys case-insensitive ([7a05300](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/7a05300ef4a0792a9c1160dfab55537c96967f08))
* update ESLint config ([2e08f8d](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/2e08f8d5a1df9bf277b2c521584dddb5b0935e72))
* version bump ([a872a23](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a872a23fec5f10f692b9c61ba7f8d671f360211f))

### Miscellaneous Chores

* add extra logging ([5da452f](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/5da452fa71608d3f52a92c7ea6f82a78ff3139a6))
* bump peerDependency appium to ^3.1.0 ([cdee0ca](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/cdee0ca44a1423312351449b3227035976ba396f))
* configure semantic-release branches for stable and preview releases ([a4a1fa2](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a4a1fa2b0b20c4494919699e8d307793cf18dc04))
* remove unnecessary ESLint ignore comments ([4c70038](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/4c7003809c6b6668315ed7e036b5ee6cf3595e51))
* upgrade dependencies and devDependencies to latest versions ([4fd016c](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/4fd016c5adc091305974b3a41c22423cadf6e3ab))

## [1.1.0](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.0.1...v1.1.0) (2025-08-06)

### Features

* adding appArguments option ([#26](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/26)) ([ded917b](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/ded917bdf2f8d224cc9cf917958177ed0e97078b))

## [1.0.1](https://github.com/AutomateThePlanet/appium-novawindows-driver/compare/v1.0.0...v1.0.1) (2025-04-25)

### Bug Fixes

* fixed crash in Node 22+ by using Buffer instead of {} with EnumDisplaySettingsA ([#17](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/17)) ([08e4907](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/08e49070020f071f3983fcb00c30e9a3ae16b9dc))
* set shouldCloseApp's default value to true ([#18](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/18)) ([28dc1d4](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/28dc1d443d416e9a44f4ddcd2fb31828e0b92bcb))

### Code Refactoring

* remove unnecessary debug logging for name locator ([#19](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/19)) ([ad50be9](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/ad50be9f9b60145a2f203f294d326eb9499339fb))

## 1.0.0 (2025-04-23)

### Miscellaneous Chores

* add .gitignore ([631fa0a](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/631fa0a72f5cda861215ff4d98ccc41c44d357f6))
* adding eslint ([c05602d](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/c05602d1aaa7fa003394ec663302017a3027db82))
* **ci:** add semantic-release workflow ([a9c39fd](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/a9c39fdab2d361678445a523a2830ea9925c4f1f))
* **lint:** fix linting issue ([6c2cb42](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/6c2cb42388a7f51842a1a5bd11905a9fe0e86ce9))
* **npm:** disable package-lock generation ([5a648ac](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/5a648ac7f65fcfef66afd6bf76ce2188b10d4ce9))
* **package:** add keywords and repository info ([fa165d0](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/fa165d007f6a424c0f11340b59ac73e1185091d8))
* **release:** rollback version to 0.0.1 for testing ([#11](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/11)) ([c4dd2c2](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/c4dd2c21e3067f70a11d72206fbc7f5da79380b6))
* updated dependencies [skip ci] ([08528fb](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/08528fb06727df50c087940fe541730a2a13483f))

### Code Refactoring

* adding enums for click and updating ([89dcebf](https://github.com/AutomateThePlanet/appium-novawindows-driver/commit/89dcebfd026f7a68b4052f33fa2c928ba42162bf))
