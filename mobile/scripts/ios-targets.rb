#!/usr/bin/env ruby
# Adds Everydaypane's native pieces to the Xcode project that `npx cap add ios` made (Melvin, 2026-11-27):
# our Swift files and entitlements on the App target, plus the Share extension and the home-screen widget targets,
# embedded in the app. Safe to run again; it only adds what's missing. Needs `gem install xcodeproj`.
#   ruby scripts/ios-targets.rb
require "xcodeproj"

ROOT = File.expand_path("../ios/App", __dir__)
project = Xcodeproj::Project.open(File.join(ROOT, "App.xcodeproj"))
app = project.targets.find { |t| t.name == "App" } or abort "No App target"
VERSION = "1.0"
BUILD = "1"
GROUP_ID = "group.com.everydaypane.app"

def group_for(project, path)
  project.main_group.find_subpath(path, true).tap do |g|
    g.set_source_tree("<group>")
    g.set_path(path) if g.path.nil?
  end
end

def add_source(group, target, name)
  ref = group.files.find { |f| f.path == name } || group.new_reference(name)
  target.source_build_phase.add_file_reference(ref, true) unless target.source_build_phase.files_references.include?(ref)
  ref
end

# --- App target ---------------------------------------------------------------------------------------------------
app_group = project.main_group.find_subpath("App", false)
%w[AppViewController.swift EverydaypanePlugin.swift].each { |f| add_source(app_group, app, f) }
app_group.files.find { |f| f.path == "App.entitlements" } || app_group.new_reference("App.entitlements")
shared = group_for(project, "Shared")
%w[AppGroup.swift ImageShrink.swift].each { |f| add_source(shared, app, f) }
app.build_configurations.each do |c|
  c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
  c.build_settings["MARKETING_VERSION"] = VERSION
  c.build_settings["CURRENT_PROJECT_VERSION"] = BUILD
end

# --- Extensions ---------------------------------------------------------------------------------------------------
def extension(project, app, shared, name:, bundle:, sources:, deployment:, frameworks: [])
  target = project.targets.find { |t| t.name == name }
  unless target
    target = project.new_target(:app_extension, name, :ios, deployment)
    target.product_reference.name = "#{name}.appex"
  end
  group = group_for(project, name)
  sources.each { |f| add_source(group, target, f) }
  %w[AppGroup.swift ImageShrink.swift].each { |f| add_source(shared, target, f) }
  group.files.find { |f| f.path == "Info.plist" } || group.new_reference("Info.plist")
  group.files.find { |f| f.path == "#{name}.entitlements" } || group.new_reference("#{name}.entitlements")
  frameworks.each do |fw|
    next if target.frameworks_build_phase.files_references.any? { |r| r.path&.end_with?("#{fw}.framework") }
    ref = project.frameworks_group.files.find { |r| r.path == "System/Library/Frameworks/#{fw}.framework" } ||
          project.frameworks_group.new_file("System/Library/Frameworks/#{fw}.framework", :sdk_root)
    target.frameworks_build_phase.add_file_reference(ref, true)
  end
  target.build_configurations.each do |c|
    s = c.build_settings
    s["PRODUCT_BUNDLE_IDENTIFIER"] = bundle
    s["PRODUCT_NAME"] = "$(TARGET_NAME)"
    s["INFOPLIST_FILE"] = "#{name}/Info.plist"
    s["GENERATE_INFOPLIST_FILE"] = "YES"
    s["INFOPLIST_KEY_CFBundleDisplayName"] = "Everydaypane"
    s["CODE_SIGN_ENTITLEMENTS"] = "#{name}/#{name}.entitlements"
    s["CODE_SIGN_STYLE"] = "Automatic"
    s["IPHONEOS_DEPLOYMENT_TARGET"] = deployment
    s["TARGETED_DEVICE_FAMILY"] = "1,2"
    s["SWIFT_VERSION"] = "5.0"
    s["MARKETING_VERSION"] = VERSION
    s["CURRENT_PROJECT_VERSION"] = BUILD
    s["SKIP_INSTALL"] = "YES"
    s["LD_RUNPATH_SEARCH_PATHS"] = "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"
    s["SWIFT_EMIT_LOC_STRINGS"] = "YES"
  end
  # Build it with the app and copy it into App.app/PlugIns.
  app.add_dependency(target) unless app.dependencies.any? { |d| d.target == target }
  embed = app.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } ||
          app.new_copy_files_build_phase("Embed Foundation Extensions").tap { |p| p.dst_subfolder_spec = "13" }
  unless embed.files_references.include?(target.product_reference)
    bf = embed.add_file_reference(target.product_reference, true)
    bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
  end
  target
end

extension(project, app, shared, name: "ShareExtension", bundle: "com.everydaypane.app.share",
          sources: %w[ShareViewController.swift], deployment: "15.0", frameworks: %w[UniformTypeIdentifiers])
extension(project, app, shared, name: "EverydaypaneWidget", bundle: "com.everydaypane.app.widget",
          sources: %w[EverydaypaneWidget.swift], deployment: "17.0", frameworks: %w[WidgetKit SwiftUI])

project.save
puts "Updated #{project.path}"
