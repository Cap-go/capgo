
<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'

</script>
<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="overflow-x-hidden bg-gray-900 text-white">
        <Header />

        <section class="relative py-12 sm:py-16 lg:pt-20 xl:pb-0">
          <div class="relative px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
            <div class="max-w-3xl mx-auto text-center">
              <p class="inline-flex px-4 py-2 text-base border border-gray-200 rounded-full font-pj">
                Made by Developers, for Developers
              </p>
              <h1 class="mt-5 text-4xl font-bold leading-tight sm:text-5xl sm:leading-tight lg:text-6xl lg:leading-tight font-pj">
                Instant updates for capacitor
              </h1>
              <p class="max-w-md mx-auto mt-6 text-base leading-7 text-gray-400 font-inter">
                Unlock Continuous Delivery for your app. Ship live updates, bug fixes, content changes, features, and more without struggle with the store review.
              </p>

              <div class="relative inline-flex mt-10 group">
                <div class="absolute transitiona-all duration-1000 opacity-70 -inset-px bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] rounded-xl blur-lg group-hover:opacity-100 group-hover:-inset-1 group-hover:duration-200 animate-tilt" />
                <a href="/register" title="" class="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-gray-900 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900" role="button">
                  Get it now
                </a>
              </div>
            </div>
          </div>
        </section>
        <section class="py-12 bg-gray-900 sm:py-16 lg:py-20">
          <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 px-16 mx-auto text-center sm:px-0 lg:max-w-4xl sm:grid-cols-3 gap-x-12 lg:gap-x-24 gap-y-8">
              <div>
                <svg class="w-auto mx-auto text-white h-14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><!--! Font Awesome Pro 6.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M228.7 299.3C222.4 293.1 222.4 282.9 228.7 276.7C234.9 270.4 245.1 270.4 251.3 276.7L304 329.4V176C304 167.2 311.2 160 320 160C328.8 160 336 167.2 336 176V329.4L388.7 276.7C394.9 270.4 405.1 270.4 411.3 276.7C417.6 282.9 417.6 293.1 411.3 299.3L331.3 379.3C325.1 385.6 314.9 385.6 308.7 379.3L228.7 299.3zM272 32C331.5 32 384.1 61.55 416 106.8C430.5 99.87 446.8 96 464 96C525.9 96 576 146.1 576 208C576 218.7 574.5 228.1 571.7 238.8C612.3 260.2 640 302.9 640 352C640 422.7 582.7 480 512 480H144C64.47 480 0 415.5 0 336C0 273.2 40.15 219.9 96.17 200.1C100.3 106.6 177.4 32 272 32zM272 64C194.6 64 131.5 125 128.1 201.5C127.6 214.6 119.1 225.1 106.8 230.3C63.18 245.7 32 287.2 32 336C32 397.9 82.14 448 144 448H512C565 448 608 405 608 352C608 315.2 587.3 283.2 556.8 267.1C543.4 259.1 536.8 244.5 540.9 229.1C542.9 223 544 215.7 544 208C544 163.8 508.2 128 464 128C451.7 128 440.1 130.8 429.7 135.7C415.7 142.4 398.8 137.9 389.8 125.2C363.7 88.12 320.7 64 272 64V64z" /></svg>
                <h3 class="mt-6 text-lg font-medium text-white md:mt-8">
                  Immediate Updates
                </h3>
                <p class="mt-3 text-sm text-gray-400">
                  Release app improvements seamlessly in the background, don't wait to push them to the app stores.
                </p>
              </div>

              <div>
                <svg class="w-auto mx-auto text-white h-14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--! Font Awesome Pro 6.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M175.1 265.9V243.9L207.1 275.9V279.7C208 279.9 208 280.1 207.1 280.3V303.1C207.1 330.5 229.5 352 255.1 352C264.1 352 271.8 349.1 278.5 346.4L301.8 369.6C288.8 378.7 273 384 255.1 384C230.8 384 208.3 372.3 193.6 354.1L152.9 381.3C145.5 386.2 135.6 384.2 130.7 376.9C125.8 369.5 127.8 359.6 135.1 354.7L178.9 325.5C177 318.7 175.1 311.4 175.1 303.1V298.1L129.1 303.9C121.2 304.1 113.2 298.8 112.1 289.1C111 281.2 117.2 273.2 126 272.1L175.1 265.9zM0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM256 480C312.1 480 363.4 459.4 402.7 425.3L86.7 109.3C52.62 148.6 32 199.9 32 256C32 379.7 132.3 480 256 480H256zM335.5 312.9L425.3 402.7C459.4 363.4 480 312.1 480 255.1C480 132.3 379.7 31.1 255.1 31.1C199.9 31.1 148.6 52.62 109.3 86.7L188.2 165.5C202.3 142.1 227.4 127.1 255.1 127.1C281.2 127.1 303.7 139.7 318.3 157.9L359.1 130.7C366.5 125.8 376.4 127.8 381.3 135.1C386.2 142.5 384.2 152.4 376.9 157.3L333.1 186.5C334.1 193.3 335.1 200.6 335.1 207.1V211.5L380.1 200.5C388.7 198.3 397.4 203.5 399.5 212.1C401.7 220.7 396.5 229.4 387.9 231.5L335.1 244.5V265.9L385.1 272.1C394.8 273.2 400.1 281.2 399.9 289.1C398.8 298.8 390.8 304.1 382 303.9L335.1 298.1V303.1C335.1 307 335.8 309.1 335.5 312.9H335.5zM303.1 281.4V207.1C303.1 181.5 282.5 159.1 255.1 159.1C236.2 159.1 219.1 172 211.8 189.2L303.1 281.4z" /></svg>
                <h3 class="mt-6 text-lg font-medium text-white md:mt-8">
                  Instant Critical Bug Fixes
                </h3>
                <p class="mt-3 text-sm text-gray-400">
                  Protect your users by releasing critical bug fixes instantaneously, and not one second later.
                </p>
              </div>

              <div>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-auto mx-auto text-white h-14" fill="currentColor" viewBox="0 0 448 512"><!--! Font Awesome Pro 6.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zM127 384.5c-5.5 9.6-17.8 12.8-27.3 7.3-9.6-5.5-12.8-17.8-7.3-27.3l14.3-24.7c16.1-4.9 29.3-1.1 39.6 11.4L127 384.5zm138.9-53.9H84c-11 0-20-9-20-20s9-20 20-20h51l65.4-113.2-20.5-35.4c-5.5-9.6-2.2-21.8 7.3-27.3 9.6-5.5 21.8-2.2 27.3 7.3l8.9 15.4 8.9-15.4c5.5-9.6 17.8-12.8 27.3-7.3 9.6 5.5 12.8 17.8 7.3 27.3l-85.8 148.6h62.1c20.2 0 31.5 23.7 22.7 40zm98.1 0h-29l19.6 33.9c5.5 9.6 2.2 21.8-7.3 27.3-9.6 5.5-21.8 2.2-27.3-7.3-32.9-56.9-57.5-99.7-74-128.1-16.7-29-4.8-58 7.1-67.8 13.1 22.7 32.7 56.7 58.9 102h52c11 0 20 9 20 20 0 11.1-9 20-20 20z" /></svg>
                <h3 class="mt-6 text-lg font-medium text-white md:mt-8">
                  App Store Compliant
                </h3>
                <p class="mt-3 text-sm text-gray-400">
                  Safely update your Capacitor apps while staying compliant with Apple and Android requirements.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section class="relative my-20 py-20 bg-gray-800">
          <svg class="hidden absolute md:block md:-top-5 md:m-0 md:-left-1/3 lg:-left-16" width="404" height="392" fill="none" viewBox="0 0 404 392">
            <defs>
              <pattern id="837c3e70-6c3a-44e6-8854-cc48c737b659" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="392" fill="url(#837c3e70-6c3a-44e6-8854-cc48c737b659)" />
          </svg>
          <svg class="hidden absolute md:block md:-bottom-5 md:m-0 md:-right-1/3 lg:-right-16" width="404" height="392" fill="none" viewBox="0 0 404 392">
            <defs>
              <pattern id="837c3e70-6c3a-44e6-8854-cc48c737b659" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="392" fill="url(#837c3e70-6c3a-44e6-8854-cc48c737b659)" />
          </svg>
          <div class="text-center">
            <h1 class="text-5xl font-semibold">
              Send updates in less than 5 mins !
            </h1>
            <p class="my-10 text-xl">
              Install the plugin in your app<br>
              Send your first build<br>
              See it appear in your app by magic
            </p>
          </div>
        </section>
        <section class="py-12 bg-gray-50 sm:py-16 lg:py-20">
          <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div class="grid grid-cols-1 md:items-center gap-y-8 md:grid-cols-2 md:gap-x-16">
              <div>
                <img class="w-auto max-w-lg mx-auto h-120" src="/manage_app.png" alt="">
              </div>

              <div class="lg:pr-12">
                <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
                  Manage version by channel from the cloud
                </h2>
                <p class="mt-5 text-lg font-medium text-gray-900 sm:mt-8 font-pj">
                  All apps have multiple channels, each channel can be managed separately.
                </p>
                <p class="mt-4 text-lg text-gray-700 sm:mt-5 font-pj">
                  Upgrade users, revert to previous versions, or rollback to a specific one, just with a click.
                </p>
              </div>
            </div>
          </div>
        </section>
        <div class="">
          <div class="max-w-7xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
            <div class="text-center">
              <h2 class="text-base font-semibold text-pumpkin-orange-600 tracking-wide uppercase">
                CI/CD
              </h2>
              <p class="mt-1 text-4xl font-extrabold text-gray-100 sm:text-5xl sm:tracking-tight lg:text-6xl">
                Save time with fully automatic deploy
              </p>
              <p class="max-w-xl mt-5 mx-auto text-xl text-gray-500">
                Fully automate your delivery pipeline to never worry about deploying your app again.
              </p>
            </div>
          </div>
        </div>
        <section class="py-12 bg-white sm:py-16 lg:py-20">
          <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div class="text-center">
              <h2 class="text-3xl font-bold text-gray-900 sm:text-4xl xl:text-5xl font-pj">
                Customers say about Capgo
              </h2>
              <p class="mt-4 text-lg font-medium text-gray-600 font-pj sm:mt-8">
                Many people have said how good Capgo is
              </p>
            </div>

            <div class="grid max-w-lg grid-cols-1 gap-10 mx-auto mt-8 md:max-w-4xl md:mt-16 md:grid-cols-2 md:gap-x-16">
              <div class="space-y-10">
                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “The community needs this and you are doing something really important!”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://avatars.githubusercontent.com/u/362329?v=4" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Lincoln Baxter
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        CEO at TopDecked
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “This project works flawless, its dead simple you got control. you dont have to rely on anyone for your code push you can use your own api, perfect 🔥”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://cdn.rareblocks.xyz/collection/clarity/images/testimonial/5/avatar-female-1.png" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Bessie Cooper
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        Senior software developer at Shopify
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “Must have tools for developers, who want to be Product Designer, UX Designer, or Interaction Designer.”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://cdn.rareblocks.xyz/collection/clarity/images/testimonial/5/avatar-female-2.png" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Aakash Chandran
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        Founder of SAAS
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-10">
                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “So capgo’s over the air update feature just saved us on launch day. We had a crash happening on a critical path but narrowed it down and deployed a fix using OTA in about an hour.”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://cdn.rareblocks.xyz/collection/clarity/images/testimonial/5/avatar-male-2.png" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Jamon Holmgren
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        CTO at Infinite Red
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “As a career-long ionic developer, getting over the air update working in ionic via capacitor feels like black magic. Loving it.”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://cdn.rareblocks.xyz/collection/clarity/images/testimonial/5/avatar-female-3.png" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Wes Johnson
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        Web Development Manager at RSR Group
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <blockquote class="py-6 bg-gray-100 rounded-2xl px-7">
                    <p class="text-lg font-normal leading-relaxed text-gray-900 font-pj">
                      “It is so easy to build your own mobile app nowadays. With technologies like capacitor and capgo, literally anyone with an idea can rapidly build their dream app. What a time to be alive!”
                    </p>
                  </blockquote>
                  <div class="flex items-center mt-5">
                    <img class="flex-shrink-0 object-cover rounded-full w-11 h-11" src="https://cdn.rareblocks.xyz/collection/clarity/images/testimonial/5/avatar-male-3.png" alt="">
                    <div class="ml-2">
                      <p class="text-base font-bold text-gray-900 font-pj">
                        Trevor Hartman
                      </p>
                      <p class="mt-0.5 font-pj text-sm text-gray-600">
                        Senior Staff cartainc
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="mx-10 lg:px-32 lg:mx-20">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <div class="order-last md:order-none">
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Release more often
              </h2>
              <p class="text-lg lg:w-2/3">
                Using Capgo you are 81% more likely to release multiple times per week, compared to people that aren’t using Capgo.
              </p>
            </div>
            <img
              class="mx-auto h-62 rounded-lg"
              src="/undraw_dev_productivity_umsq.svg"
              alt="productivity illustration"
            >
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <img
              class="mx-auto h-62 rounded-lg my-10"
              src="/undraw_develop_app_re_bi4i.svg"
              alt="build illustration"
            >
            <div>
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Integration with your pipeline
              </h2>
              <p class="text-lg lg:w-2/3">
                Use the intuitive CLI to quickly integrate Capgo features with your existing CI/CD platform.<br><br>
                It work with Azure DevOps, GitLab, GitHub, Jenkins, Cloudbees, Travis, Azure DevOps, GitLab, GitHub, CircleCI, and more.
              </p>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <div class="order-last md:order-none">
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Update
              </h2>
              <p class="text-lg lg:w-2/3">
                Shipped a bug? No worries: with one command, you can deploy a fix that your users will see instantly, without having to re-download your app.
              </p>
            </div>
            <img
              class="mx-auto h-62 rounded-lg"
              src="/undraw_pull_request_gld8.svg"
              alt="send update illustration"
            >
          </div>
        </section>
        <div class="relative mt-24 sm:mt-32 sm:py-16">
          <div aria-hidden="true" class="hidden sm:block">
            <div class="absolute inset-y-0 left-0 w-1/2 bg-gray-800 rounded-r-3xl" />
            <svg class="absolute top-8 left-1/2 -ml-3" width="404" height="392" fill="none" viewBox="0 0 404 392">
              <defs>
                <pattern id="8228f071-bcee-4ec8-905a-2a059a2cc4fb" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="404" height="392" fill="url(#8228f071-bcee-4ec8-905a-2a059a2cc4fb)" />
            </svg>
          </div>
          <div class="mx-auto max-w-md px-4 sm:max-w-3xl sm:px-6 lg:max-w-7xl lg:px-8">
            <div class="relative rounded-2xl px-6 py-10 bg-gray-700 overflow-hidden shadow-xl sm:px-12 sm:py-20">
              <div aria-hidden="true" class="absolute inset-0 -mt-72 sm:-mt-32 md:mt-0">
                <svg class="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1463 360">
                  <path class="text-gray-600 text-opacity-40" fill="currentColor" d="M-82.673 72l1761.849 472.086-134.327 501.315-1761.85-472.086z" />
                  <path class="text-gray-800 text-opacity-40" fill="currentColor" d="M-217.088 544.086L1544.761 72l134.327 501.316-1761.849 472.086z" />
                </svg>
              </div>
              <div class="relative flex flex-col">
                <div class="sm:text-center">
                  <h2 class="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                    Push hot code updates
                  </h2>
                  <p class="mt-6 mx-auto max-w-2xl text-lg text-gray-100">
                    Like you push a commit
                  </p>
                </div>
                <router-link to="/register" class="w-auto inline-block mt-5 mx-auto rounded-md border border-transparent px-5 py-3 bg-gray-900 text-base font-medium text-white shadow hover:bg-black focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-rose-500 sm:px-10">
                  Get started &RightArrow;
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
