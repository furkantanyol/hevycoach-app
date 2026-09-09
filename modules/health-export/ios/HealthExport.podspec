Pod::Spec.new do |s|
  s.name           = 'HealthExport'
  s.version        = '1.0.0'
  s.summary        = 'Exports Hevy workouts to Apple Health'
  s.description    = 'Local Expo Module that writes strength-training workouts to HealthKit idempotently'
  s.author         = 'Furkan Tanyol'
  s.homepage       = 'https://github.com/furkantanyol/hevycoach-app'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: 'https://github.com/furkantanyol/hevycoach-app.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
